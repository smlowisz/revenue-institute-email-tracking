-- ============================================
-- DE-ANONYMIZATION QUERY (PostgreSQL)
-- ============================================
-- Matches email hashes from events to known leads
-- Links anonymous activity to identified visitors
-- Run this every 15 minutes
-- ============================================

-- Step 1: Find email hashes from events
WITH email_captures AS (
  SELECT DISTINCT
    e.id as event_id,
    e.lead_id,
    e.session_id,
    e.data->>'emailHash' as email_hash,
    e.data->>'emailDomain' as email_domain,
    e.created_at
  FROM event e
  WHERE e.type IN ('email_captured', 'form_submit', 'browser_emails_scanned')
    AND e.data->>'emailHash' IS NOT NULL
    AND e.created_at >= NOW() - INTERVAL '1 hour'
),

-- Step 2: Also extract from browser_emails_scanned (array of emails)
browser_emails AS (
  SELECT DISTINCT
    e.id as event_id,
    e.lead_id,
    e.session_id,
    email_obj->>'hash' as email_hash,
    email_obj->>'email' as plain_email,
    e.created_at
  FROM event e,
  jsonb_array_elements(e.data->'emails') as email_obj
  WHERE e.type = 'browser_emails_scanned'
    AND e.created_at >= NOW() - INTERVAL '1 hour'
),

-- Step 3: Match email hashes to leads (using SHA-256)
matched_leads AS (
  SELECT DISTINCT
    ec.lead_id as anonymous_lead_id,
    ec.session_id,
    ec.email_hash,
    l.id as identified_lead_id,
    l.work_email as matched_email,
    l.tracking_id
  FROM email_captures ec
  INNER JOIN lead l ON (
    -- Match SHA-256 hash of work_email or personal_email
    encode(digest(lower(trim(l.work_email)), 'sha256'), 'hex') = ec.email_hash
    OR encode(digest(lower(trim(l.personal_email)), 'sha256'), 'hex') = ec.email_hash
  )
  WHERE l.work_email IS NOT NULL OR l.personal_email IS NOT NULL
  
  UNION
  
  -- Also match from browser scanned emails
  SELECT DISTINCT
    be.lead_id as anonymous_lead_id,
    be.session_id,
    be.email_hash,
    l.id as identified_lead_id,
    l.work_email as matched_email,
    l.tracking_id
  FROM browser_emails be
  INNER JOIN lead l ON (
    encode(digest(lower(trim(l.work_email)), 'sha256'), 'hex') = be.email_hash
    OR encode(digest(lower(trim(l.personal_email)), 'sha256'), 'hex') = be.email_hash
    OR lower(trim(l.work_email)) = lower(trim(be.plain_email))
    OR lower(trim(l.personal_email)) = lower(trim(be.plain_email))
  )
  WHERE l.work_email IS NOT NULL OR l.personal_email IS NOT NULL
)

-- Step 4: Insert into session_id_map
INSERT INTO session_id_map (
  session_id,
  original_visitor_id,
  identified_visitor_id,
  email,
  email_hash,
  identified_at,
  id_method,
  event_count,
  created_at,
  updated_at
)
SELECT 
  ml.session_id,
  ml.anonymous_lead_id::text as original_visitor_id,
  ml.tracking_id as identified_visitor_id,
  ml.matched_email as email,
  ml.email_hash,
  NOW() as identified_at,
  'email_hash_match' as id_method,
  (SELECT COUNT(*) FROM event WHERE session_id = ml.session_id)::integer as event_count,
  NOW() as created_at,
  NOW() as updated_at
FROM matched_leads ml
WHERE NOT EXISTS (
  -- Don't duplicate existing mappings
  SELECT 1 FROM session_id_map 
  WHERE session_id = ml.session_id
)
ON CONFLICT (session_id) DO NOTHING;

-- ============================================
-- Step 5: Update anonymous events with identified lead_id
-- ============================================

UPDATE event e
SET 
  lead_id = (
    SELECT identified_lead_id::uuid 
    FROM matched_leads ml
    WHERE ml.anonymous_lead_id = e.lead_id
    LIMIT 1
  ),
  updated_at = NOW()
WHERE e.lead_id IN (
  SELECT DISTINCT anonymous_lead_id FROM matched_leads
);

-- ============================================
-- DONE: Events de-anonymized and linked to known leads
-- ============================================

