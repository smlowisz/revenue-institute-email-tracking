-- ============================================
-- TEST QUERIES FOR web_visitor Architecture
-- ============================================
-- Run these queries after deployment to verify everything works
-- ============================================

-- ============================================
-- 1. CHECK TABLE STRUCTURE
-- ============================================

-- Verify web_visitor table has all columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'web_visitor'
ORDER BY ordinal_position;

-- Verify lead has new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'lead'
AND column_name IN ('email_hashes', 'original_visitor_id', 'identified_at', 'identification_method')
ORDER BY ordinal_position;

-- Verify event has web_visitor_id
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'event'
AND column_name = 'web_visitor_id';

-- ============================================
-- 2. CHECK CONSTRAINTS
-- ============================================

-- List all constraints on event table
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'event'
AND constraint_name IN ('check_event_owner', 'fk_event_web_visitor');

-- List all constraints on session table
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'session'
AND constraint_name IN ('check_session_owner', 'fk_session_web_visitor');

-- ============================================
-- 3. CHECK FUNCTIONS
-- ============================================

-- List all custom functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'add_email_hashes',
  'find_visitor_by_email_hash',
  'find_lead_by_email_hash',
  'identify_visitor',
  'get_or_create_web_visitor'
);

-- ============================================
-- 4. CHECK VIEWS
-- ============================================

-- List all custom views
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
AND table_name IN (
  'all_visitors',
  'anonymous_visitors',
  'recently_identified',
  'high_intent_anonymous'
);

-- ============================================
-- 5. CHECK DATA INTEGRITY
-- ============================================

-- Check for orphaned events (should be 0!)
SELECT COUNT(*) as orphaned_events
FROM event
WHERE web_visitor_id IS NULL AND lead_id IS NULL;

-- Check for events with BOTH IDs (should be 0!)
SELECT COUNT(*) as invalid_events
FROM event
WHERE web_visitor_id IS NOT NULL AND lead_id IS NOT NULL;

-- Check for orphaned sessions (should be 0!)
SELECT COUNT(*) as orphaned_sessions
FROM session
WHERE web_visitor_id IS NULL AND lead_id IS NULL;

-- Check for sessions with BOTH IDs (should be 0!)
SELECT COUNT(*) as invalid_sessions
FROM session
WHERE web_visitor_id IS NOT NULL AND lead_id IS NOT NULL;

-- ============================================
-- 6. CHECK EVENT DISTRIBUTION
-- ============================================

-- Events by owner type
SELECT 
  CASE 
    WHEN web_visitor_id IS NOT NULL THEN 'web_visitor'
    WHEN lead_id IS NOT NULL THEN 'lead'
    ELSE 'ORPHANED'
  END as owner_type,
  COUNT(*) as event_count
FROM event
GROUP BY owner_type;

-- Sessions by owner type
SELECT 
  CASE 
    WHEN web_visitor_id IS NOT NULL THEN 'web_visitor'
    WHEN lead_id IS NOT NULL THEN 'lead'
    ELSE 'ORPHANED'
  END as owner_type,
  COUNT(*) as session_count
FROM session
GROUP BY owner_type;

-- ============================================
-- 7. CHECK VISITOR STATS
-- ============================================

-- Total web_visitor records
SELECT 
  COUNT(*) as total_visitors,
  COUNT(*) FILTER (WHERE is_identified = FALSE) as anonymous,
  COUNT(*) FILTER (WHERE is_identified = TRUE) as identified,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_identified = TRUE) / NULLIF(COUNT(*), 0), 2) as identification_rate
FROM web_visitor;

-- Web visitors by engagement level
SELECT 
  engagement_level,
  COUNT(*) as count,
  AVG(intent_score) as avg_intent_score,
  AVG(total_pageviews) as avg_pageviews
FROM web_visitor
WHERE engagement_level IS NOT NULL
GROUP BY engagement_level
ORDER BY avg_intent_score DESC;

-- ============================================
-- 8. CHECK EMAIL HASHES
-- ============================================

-- Web visitors with email hashes
SELECT 
  COUNT(*) as total_visitors,
  COUNT(*) FILTER (WHERE email_hashes IS NOT NULL) as has_hashes,
  COUNT(*) FILTER (WHERE jsonb_array_length(email_hashes->'sha256') > 0) as has_sha256,
  COUNT(*) FILTER (WHERE jsonb_array_length(email_hashes->'sha1') > 0) as has_sha1,
  COUNT(*) FILTER (WHERE jsonb_array_length(email_hashes->'md5') > 0) as has_md5
FROM web_visitor;

-- Sample email hashes
SELECT 
  visitor_id,
  email_hashes->'sha256' as sha256_hashes,
  email_hashes->'sha1' as sha1_hashes,
  email_hashes->'md5' as md5_hashes,
  email_domains,
  is_identified
FROM web_visitor
WHERE email_hashes IS NOT NULL
LIMIT 5;

-- ============================================
-- 9. CHECK RECENT ACTIVITY
-- ============================================

-- Recent web_visitor records (last 24 hours)
SELECT 
  visitor_id,
  is_identified,
  first_seen_at,
  last_seen_at,
  total_sessions,
  total_pageviews,
  intent_score,
  device_fingerprint,
  browser_id
FROM web_visitor
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 10;

-- Recent events (last 1 hour)
SELECT 
  e.type,
  e.category,
  CASE 
    WHEN e.web_visitor_id IS NOT NULL THEN 'web_visitor'
    WHEN e.lead_id IS NOT NULL THEN 'lead'
  END as owner_type,
  e.url,
  e.created_at
FROM event e
WHERE e.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY e.created_at DESC
LIMIT 20;

-- ============================================
-- 10. TEST FUNCTIONS
-- ============================================

-- Test get_or_create_web_visitor (read-only test)
-- This will create a test visitor if it doesn't exist
-- SELECT get_or_create_web_visitor(
--   'test-visitor-qa-' || NOW()::text,
--   'test-device-fp',
--   'test-browser-id'
-- );

-- Test find_visitor_by_email_hash
-- (Replace with actual hash from your data)
-- SELECT * FROM find_visitor_by_email_hash(
--   p_sha256 := 'your-actual-sha256-hash-here'
-- );

-- ============================================
-- 11. VIEW TESTS
-- ============================================

-- All visitors view
SELECT COUNT(*) as total FROM all_visitors;

-- Anonymous visitors view
SELECT COUNT(*) as anonymous FROM anonymous_visitors;

-- Recently identified view
SELECT * FROM recently_identified LIMIT 5;

-- High-intent anonymous view
SELECT * FROM high_intent_anonymous LIMIT 5;

-- ============================================
-- 12. IDENTIFICATION FLOW TEST
-- ============================================

-- Find a web_visitor that could be identified
SELECT 
  wv.id,
  wv.visitor_id,
  wv.is_identified,
  wv.email_domains,
  (SELECT COUNT(*) FROM event WHERE web_visitor_id = wv.id) as event_count
FROM web_visitor wv
WHERE wv.is_identified = FALSE
  AND wv.email_domains IS NOT NULL
  AND array_length(wv.email_domains, 1) > 0
LIMIT 1;

-- To test identification (⚠️ THIS WILL MODIFY DATA!):
-- SELECT identify_visitor(
--   'visitor-id-from-above',
--   'email@example.com',
--   'Test',
--   'User',
--   'manual_test'
-- );

-- ============================================
-- 13. PERFORMANCE CHECKS
-- ============================================

-- Check index usage on web_visitor
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE tablename = 'web_visitor'
ORDER BY idx_scan DESC;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('web_visitor', 'lead', 'event', 'session')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================
-- SUMMARY DASHBOARD
-- ============================================

SELECT 
  'web_visitor Stats' as metric_category,
  json_build_object(
    'total', (SELECT COUNT(*) FROM web_visitor),
    'anonymous', (SELECT COUNT(*) FROM web_visitor WHERE is_identified = FALSE),
    'identified', (SELECT COUNT(*) FROM web_visitor WHERE is_identified = TRUE),
    'with_email_hashes', (SELECT COUNT(*) FROM web_visitor WHERE email_hashes IS NOT NULL),
    'avg_pageviews', (SELECT ROUND(AVG(total_pageviews), 2) FROM web_visitor),
    'avg_sessions', (SELECT ROUND(AVG(total_sessions), 2) FROM web_visitor),
    'avg_intent_score', (SELECT ROUND(AVG(intent_score), 2) FROM web_visitor WHERE intent_score > 0)
  ) as stats
UNION ALL
SELECT 
  'Event Distribution' as metric_category,
  json_build_object(
    'total_events', (SELECT COUNT(*) FROM event),
    'on_web_visitor', (SELECT COUNT(*) FROM event WHERE web_visitor_id IS NOT NULL),
    'on_lead', (SELECT COUNT(*) FROM event WHERE lead_id IS NOT NULL),
    'orphaned', (SELECT COUNT(*) FROM event WHERE web_visitor_id IS NULL AND lead_id IS NULL),
    'invalid', (SELECT COUNT(*) FROM event WHERE web_visitor_id IS NOT NULL AND lead_id IS NOT NULL)
  ) as stats
UNION ALL
SELECT 
  'Session Distribution' as metric_category,
  json_build_object(
    'total_sessions', (SELECT COUNT(*) FROM session),
    'on_web_visitor', (SELECT COUNT(*) FROM session WHERE web_visitor_id IS NOT NULL),
    'on_lead', (SELECT COUNT(*) FROM session WHERE lead_id IS NOT NULL),
    'orphaned', (SELECT COUNT(*) FROM session WHERE web_visitor_id IS NULL AND lead_id IS NULL)
  ) as stats;
