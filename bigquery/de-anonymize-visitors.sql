-- ============================================
-- De-Anonymize Visitors Based on Email Capture
-- Schedule: Every 15 minutes
-- ============================================
-- This query finds anonymous sessions where the user submitted
-- a form with their email, then links all their activity to their identity

-- Step 1: Find email_identified or form_submit events with email hashes
WITH email_captures AS (
  SELECT DISTINCT
    sessionId,
    JSON_EXTRACT_SCALAR(data, '$.emailHash') as emailHash,
    timestamp
  FROM `n8n-revenueinstitute.outbound_sales.events`
  WHERE type IN ('email_identified', 'form_submit')
    AND JSON_EXTRACT_SCALAR(data, '$.emailHash') IS NOT NULL
    AND visitorId IS NULL  -- Was anonymous
    AND _insertedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
),

-- Step 2: Match email hashes to known leads
matched_identities AS (
  SELECT 
    ec.sessionId,
    ec.emailHash,
    l.trackingId,
    l.email,
    l.person_name,
    l.company_name
  FROM email_captures ec
  JOIN `n8n-revenueinstitute.outbound_sales.leads` l
    ON SUBSTR(TO_HEX(SHA256(LOWER(TRIM(l.email)))), 1, 64) = ec.emailHash
  WHERE l.trackingId IS NOT NULL
),

-- Step 3: Get all events from those sessions
sessions_to_update AS (
  SELECT DISTINCT sessionId
  FROM matched_identities
)

-- Step 4: Update all events in those sessions with the identified visitorId
-- Note: BigQuery doesn't support UPDATE on streaming buffer
-- Instead, we'll create a mapping table and use it in queries

SELECT 
  mi.sessionId,
  mi.trackingId as newVisitorId,
  mi.email,
  mi.person_name,
  mi.company_name,
  mi.emailHash,
  COUNT(e.type) as eventsInSession,
  MIN(TIMESTAMP_MILLIS(e.timestamp)) as sessionStart,
  ARRAY_AGG(DISTINCT e.type) as eventTypes
FROM matched_identities mi
JOIN `n8n-revenueinstitute.outbound_sales.events` e ON mi.sessionId = e.sessionId
GROUP BY mi.sessionId, mi.trackingId, mi.email, mi.person_name, mi.company_name, mi.emailHash;

-- ============================================
-- De-Anonymization Mapping Table
-- Store session-to-identity mappings
-- ============================================
CREATE TABLE IF NOT EXISTS `n8n-revenueinstitute.outbound_sales.session_identity_map` (
  sessionId STRING NOT NULL,
  originalVisitorId STRING,  -- NULL if was anonymous
  identifiedVisitorId STRING NOT NULL,  -- The tracking ID we matched
  email STRING,
  emailHash STRING,
  identifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  identificationMethod STRING,  -- 'form_submit', 'email_blur', etc.
  eventsCount INT64
)
CLUSTER BY sessionId, identifiedVisitorId;

-- Insert de-anonymized mappings
INSERT INTO `n8n-revenueinstitute.outbound_sales.session_identity_map`
  (sessionId, originalVisitorId, identifiedVisitorId, email, emailHash, 
   identifiedAt, identificationMethod, eventsCount)
SELECT 
  mi.sessionId,
  NULL as originalVisitorId,
  mi.trackingId as identifiedVisitorId,
  mi.email,
  mi.emailHash,
  CURRENT_TIMESTAMP() as identifiedAt,
  'form_email_capture' as identificationMethod,
  COUNT(e.type) as eventsCount
FROM matched_identities mi
JOIN `n8n-revenueinstitute.outbound_sales.events` e ON mi.sessionId = e.sessionId
WHERE mi.sessionId NOT IN (
  SELECT sessionId FROM `n8n-revenueinstitute.outbound_sales.session_identity_map`
)
GROUP BY mi.sessionId, mi.trackingId, mi.email, mi.emailHash;

