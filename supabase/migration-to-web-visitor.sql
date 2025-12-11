-- ============================================
-- MIGRATION: Transition to web_visitor Architecture
-- ============================================
-- This script migrates from the old structure where all visitors
-- were in the lead table to the new structure where:
-- - Anonymous visitors → web_visitor table
-- - Identified visitors → lead table
-- ============================================

-- WARNING: This is a complex migration. Test in staging first!
-- BACKUP YOUR DATABASE BEFORE RUNNING!

-- ============================================
-- STEP 1: Check Prerequisites
-- ============================================

DO $$
BEGIN
  -- Check if web_visitor table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'web_visitor') THEN
    RAISE EXCEPTION 'web_visitor table does not exist. Run schema-web-visitor.sql first!';
  END IF;
  
  -- Check if old lead table has data
  IF NOT EXISTS (SELECT 1 FROM lead LIMIT 1) THEN
    RAISE NOTICE 'No data in lead table to migrate';
  END IF;
  
  RAISE NOTICE 'Prerequisites check passed';
END $$;

-- ============================================
-- STEP 2: Add Temporary Migration Columns
-- ============================================

-- Add temporary columns to track migration status
ALTER TABLE lead ADD COLUMN IF NOT EXISTS _migration_status TEXT;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS _is_anonymous BOOLEAN DEFAULT FALSE;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS _migrated_to_web_visitor BOOLEAN DEFAULT FALSE;

-- ============================================
-- STEP 3: Identify Anonymous vs Identified Leads
-- ============================================

-- Mark leads as anonymous if they have NO identifying information
UPDATE lead
SET _is_anonymous = TRUE
WHERE 
  (work_email IS NULL OR work_email = '') AND
  (personal_email IS NULL OR personal_email = '') AND
  (first_name IS NULL OR first_name = '') AND
  (last_name IS NULL OR last_name = '') AND
  (phone IS NULL OR phone = '') AND
  (linkedin_url IS NULL OR linkedin_url = '');

-- Mark leads as identified if they have ANY identifying information
UPDATE lead
SET _is_anonymous = FALSE
WHERE _is_anonymous IS NULL OR _is_anonymous = FALSE;

-- ============================================
-- STEP 4: Migrate Anonymous Leads to web_visitor
-- ============================================

-- Insert anonymous leads into web_visitor
INSERT INTO web_visitor (
  visitor_id,
  device_fingerprint,
  browser_id,
  first_seen_at,
  last_seen_at,
  total_sessions,
  total_pageviews,
  total_clicks,
  is_identified,
  tracking_id, -- Store tracking_id for lookup
  created_at,
  updated_at
)
SELECT 
  -- Use tracking_id as visitor_id if available, otherwise generate new one
  COALESCE(tracking_id, 'migrated-' || id::text) as visitor_id,
  NULL as device_fingerprint, -- Will be populated from events
  NULL as browser_id,
  created_at as first_seen_at,
  updated_at as last_seen_at,
  0 as total_sessions, -- Will be calculated from sessions
  0 as total_pageviews,
  0 as total_clicks,
  FALSE as is_identified,
  tracking_id,
  created_at,
  updated_at
FROM lead
WHERE _is_anonymous = TRUE
  AND _migrated_to_web_visitor = FALSE
ON CONFLICT (visitor_id) DO NOTHING;

-- Mark migrated anonymous leads
UPDATE lead
SET _migrated_to_web_visitor = TRUE
WHERE _is_anonymous = TRUE;

-- ============================================
-- STEP 5: Link Sessions to web_visitor
-- ============================================

-- Update sessions that belonged to anonymous leads
UPDATE session s
SET 
  web_visit_id = wv.id,
  lead_id = NULL
FROM lead l
INNER JOIN web_visitor wv ON (
  -- Match by tracking_id or generated visitor_id
  wv.visitor_id = COALESCE(l.tracking_id, 'migrated-' || l.id::text)
)
WHERE 
  s.lead_id = l.id
  AND l._is_anonymous = TRUE
  AND l._migrated_to_web_visitor = TRUE;

-- ============================================
-- STEP 6: Link Events to web_visitor
-- ============================================

-- Update events that belonged to anonymous leads
UPDATE event e
SET 
  web_visit_id = wv.id,
  lead_id = NULL
FROM lead l
INNER JOIN web_visitor wv ON (
  wv.visitor_id = COALESCE(l.tracking_id, 'migrated-' || l.id::text)
)
WHERE 
  e.lead_id = l.id
  AND l._is_anonymous = TRUE
  AND l._migrated_to_web_visitor = TRUE;

-- ============================================
-- STEP 7: Calculate Aggregates for web_visitor
-- ============================================

-- Update session counts
UPDATE web_visitor wv
SET total_sessions = (
  SELECT COUNT(*)
  FROM session s
  WHERE s.web_visit_id = wv.id
);

-- Update pageview counts
UPDATE web_visitor wv
SET total_pageviews = (
  SELECT COUNT(*)
  FROM event e
  WHERE e.web_visit_id = wv.id
    AND e.type = 'page_view'
);

-- Update click counts
UPDATE web_visitor wv
SET total_clicks = (
  SELECT COUNT(*)
  FROM event e
  WHERE e.web_visit_id = wv.id
    AND e.type = 'click'
);

-- Update last seen from events
UPDATE web_visitor wv
SET last_seen_at = (
  SELECT MAX(created_at)
  FROM event e
  WHERE e.web_visit_id = wv.id
);

-- Update first page from events
UPDATE web_visitor wv
SET first_page = (
  SELECT url
  FROM event e
  WHERE e.web_visit_id = wv.id
    AND e.type = 'page_view'
  ORDER BY created_at ASC
  LIMIT 1
);

-- Update last page from events
UPDATE web_visitor wv
SET last_page = (
  SELECT url
  FROM event e
  WHERE e.web_visit_id = wv.id
    AND e.type = 'page_view'
  ORDER BY created_at DESC
  LIMIT 1
);

-- Update device info from events
UPDATE web_visitor wv
SET 
  device = (
    SELECT data->>'device'
    FROM event e
    WHERE e.web_visit_id = wv.id
      AND e.data->>'device' IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  ),
  browser = (
    SELECT data->>'browser'
    FROM event e
    WHERE e.web_visit_id = wv.id
      AND e.data->>'browser' IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  ),
  operating_system = (
    SELECT data->>'platform'
    FROM event e
    WHERE e.web_visit_id = wv.id
      AND e.data->>'platform' IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  ),
  country = (
    SELECT country
    FROM event e
    WHERE e.web_visit_id = wv.id
      AND e.country IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  ),
  city = (
    SELECT city
    FROM event e
    WHERE e.web_visit_id = wv.id
      AND e.city IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  );

-- ============================================
-- STEP 8: Update Identified Leads
-- ============================================

-- For identified leads, keep them in lead table but add original_visitor_id
UPDATE lead l
SET original_visitor_id = tracking_id
WHERE 
  _is_anonymous = FALSE
  AND tracking_id IS NOT NULL;

-- ============================================
-- STEP 9: Clean Up Anonymous Leads
-- ============================================

-- Archive anonymous lead records (optional - comment out if you want to keep them)
-- We'll keep them for now with a flag to indicate they've been migrated

UPDATE lead
SET _migration_status = 'migrated_to_web_visitor'
WHERE _is_anonymous = TRUE
  AND _migrated_to_web_visitor = TRUE;

-- ============================================
-- STEP 10: Validation Checks
-- ============================================

DO $$
DECLARE
  v_total_anonymous INT;
  v_migrated_web_visitor INT;
  v_sessions_without_owner INT;
  v_events_without_owner INT;
BEGIN
  -- Count anonymous leads
  SELECT COUNT(*) INTO v_total_anonymous
  FROM lead
  WHERE _is_anonymous = TRUE;
  
  -- Count migrated web_visitor
  SELECT COUNT(*) INTO v_migrated_web_visitor
  FROM web_visitor
  WHERE visitor_id LIKE 'migrated-%';
  
  RAISE NOTICE 'Anonymous leads found: %', v_total_anonymous;
  RAISE NOTICE 'Web visits created: %', v_migrated_web_visitor;
  
  -- Check for orphaned sessions (neither web_visit_id nor lead_id)
  SELECT COUNT(*) INTO v_sessions_without_owner
  FROM session
  WHERE web_visit_id IS NULL AND lead_id IS NULL;
  
  IF v_sessions_without_owner > 0 THEN
    RAISE WARNING 'Found % sessions without owner! This may need manual review.', v_sessions_without_owner;
  END IF;
  
  -- Check for orphaned events
  SELECT COUNT(*) INTO v_events_without_owner
  FROM event
  WHERE web_visit_id IS NULL AND lead_id IS NULL;
  
  IF v_events_without_owner > 0 THEN
    RAISE WARNING 'Found % events without owner! This may need manual review.', v_events_without_owner;
  END IF;
  
  RAISE NOTICE 'Migration validation complete!';
END $$;

-- ============================================
-- STEP 11: Create Migration Summary Report
-- ============================================

-- Show migration summary
SELECT 
  'MIGRATION SUMMARY' as report_type,
  (SELECT COUNT(*) FROM lead WHERE _is_anonymous = TRUE) as anonymous_leads,
  (SELECT COUNT(*) FROM lead WHERE _is_anonymous = FALSE) as identified_leads,
  (SELECT COUNT(*) FROM web_visitor) as total_web_visitor,
  (SELECT COUNT(*) FROM web_visitor WHERE is_identified = FALSE) as anonymous_web_visitor,
  (SELECT COUNT(*) FROM web_visitor WHERE is_identified = TRUE) as identified_web_visitor,
  (SELECT COUNT(*) FROM session WHERE web_visit_id IS NOT NULL) as sessions_on_web_visitor,
  (SELECT COUNT(*) FROM session WHERE lead_id IS NOT NULL) as sessions_on_leads,
  (SELECT COUNT(*) FROM event WHERE web_visit_id IS NOT NULL) as events_on_web_visitor,
  (SELECT COUNT(*) FROM event WHERE lead_id IS NOT NULL) as events_on_leads;

-- ============================================
-- STEP 12: Optional Cleanup
-- ============================================

-- After verifying migration is successful, you can:
-- 1. Drop temporary migration columns
-- ALTER TABLE lead DROP COLUMN IF EXISTS _migration_status;
-- ALTER TABLE lead DROP COLUMN IF EXISTS _is_anonymous;
-- ALTER TABLE lead DROP COLUMN IF EXISTS _migrated_to_web_visitor;

-- 2. Delete migrated anonymous lead records (optional - they're already in web_visitor)
-- DELETE FROM lead WHERE _migration_status = 'migrated_to_web_visitor';

-- 3. Drop old indexes that are no longer needed
-- (Review indexes first to ensure they're not being used)

-- ============================================
-- STEP 13: Post-Migration Tasks
-- ============================================

-- After migration, you should:
-- 1. Update your application code to use web_visitor table
-- 2. Update your worker code (see updated worker code in worker/index.ts)
-- 3. Test identification flow with identify_visitor() function
-- 4. Update your analytics queries to use new views
-- 5. Update BigQuery sync scripts to match new structure

-- Test identification flow:
-- SELECT identify_visitor('test-visitor-123', 'test@example.com', 'John', 'Doe', 'form_submit');

RAISE NOTICE 'Migration complete! Review the summary above and test thoroughly.';
RAISE NOTICE 'Remember to update application code to use new structure.';
RAISE NOTICE 'See schema-web-visitor.sql for helper functions and views.';
