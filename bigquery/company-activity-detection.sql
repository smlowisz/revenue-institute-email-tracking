-- ============================================
-- Multi-Visitor Company Detection
-- Detect when multiple people from same company visit
-- ============================================

-- Create view for company-level activity
CREATE OR REPLACE VIEW `n8n-revenueinstitute.outbound_sales.company_activity` AS
WITH company_visitors AS (
  SELECT 
    companyIdentifier,
    asOrganization as ispOrCompany,
    city,
    region,
    country,
    COUNT(DISTINCT CASE WHEN visitorId IS NOT NULL THEN visitorId END) as identifiedVisitors,
    COUNT(DISTINCT sessionId) as totalSessions,
    COUNT(DISTINCT CASE WHEN visitorId IS NULL THEN sessionId END) as anonymousSessions,
    ARRAY_AGG(DISTINCT visitorId IGNORE NULLS) as visitorIds,
    MIN(TIMESTAMP_MILLIS(timestamp)) as firstVisit,
    MAX(TIMESTAMP_MILLIS(timestamp)) as lastVisit,
    ARRAY_AGG(DISTINCT JSON_EXTRACT_SCALAR(data, '$.path') IGNORE NULLS) as pagesVisited,
    COUNT(*) as totalEvents
  FROM `n8n-revenueinstitute.outbound_sales.events`
  WHERE companyIdentifier IS NOT NULL
    AND _insertedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  GROUP BY companyIdentifier, ispOrCompany, city, region, country
)
SELECT 
  *,
  -- Flag for multiple visitors from same company
  identifiedVisitors > 1 as hasMultipleVisitors,
  identifiedVisitors + anonymousSessions as totalUniqueVisitors,
  TIMESTAMP_DIFF(lastVisit, firstVisit, DAY) as daysSinceFirstVisit,
  totalSessions / GREATEST(TIMESTAMP_DIFF(lastVisit, firstVisit, DAY), 1) as sessionsPerDay
FROM company_visitors
WHERE totalEvents > 3  -- Filter noise
ORDER BY identifiedVisitors DESC, totalSessions DESC;


-- ============================================
-- Visitor Return Pattern Analysis
-- Track return visit patterns (#4)
-- ============================================
CREATE OR REPLACE VIEW `n8n-revenueinstitute.outbound_sales.visitor_return_patterns` AS
WITH visitor_visits AS (
  SELECT 
    visitorId,
    DATE(TIMESTAMP_MILLIS(timestamp)) as visit_date,
    MIN(TIMESTAMP_MILLIS(timestamp)) as first_event,
    MAX(TIMESTAMP_MILLIS(timestamp)) as last_event,
    COUNT(DISTINCT sessionId) as sessions_that_day,
    ARRAY_AGG(DISTINCT JSON_EXTRACT_SCALAR(data, '$.path') IGNORE NULLS) as pages_visited
  FROM `n8n-revenueinstitute.outbound_sales.events`
  WHERE visitorId IS NOT NULL
    AND type = 'pageview'
  GROUP BY visitorId, visit_date
)
SELECT 
  visitorId,
  COUNT(DISTINCT visit_date) as totalVisitDays,
  MIN(first_event) as firstEverVisit,
  MAX(last_event) as lastVisit,
  TIMESTAMP_DIFF(MAX(last_event), MIN(first_event), DAY) as daysBetweenFirstAndLast,
  
  -- Return patterns
  ARRAY_AGG(visit_date ORDER BY visit_date) as visitDates,
  SUM(sessions_that_day) as totalSessions,
  
  -- Frequency indicators
  CASE 
    WHEN COUNT(DISTINCT visit_date) > 1 THEN
      TIMESTAMP_DIFF(MAX(last_event), MIN(first_event), DAY) / (COUNT(DISTINCT visit_date) - 1)
    ELSE NULL
  END as avgDaysBetweenVisits,
  
  -- Return timing
  CASE
    WHEN TIMESTAMP_DIFF(MAX(last_event), LAG(MAX(last_event)) OVER (PARTITION BY visitorId ORDER BY MAX(last_event)), HOUR) <= 24 THEN 'returned_within_24h'
    WHEN TIMESTAMP_DIFF(MAX(last_event), LAG(MAX(last_event)) OVER (PARTITION BY visitorId ORDER BY MAX(last_event)), HOUR) <= 72 THEN 'returned_within_3d'
    WHEN TIMESTAMP_DIFF(MAX(last_event), LAG(MAX(last_event)) OVER (PARTITION BY visitorId ORDER BY MAX(last_event)), DAY) <= 7 THEN 'returned_within_week'
    ELSE 'slow_return'
  END as returnTiming
  
FROM visitor_visits
GROUP BY visitorId
HAVING totalVisitDays > 1  -- Only return visitors
ORDER BY totalVisitDays DESC, lastVisit DESC;


-- ============================================
-- Content Depth Tracking (#5)
-- How deep did visitors go?
-- ============================================
CREATE OR REPLACE VIEW `n8n-revenueinstitute.outbound_sales.content_depth` AS
SELECT 
  visitorId,
  sessionId,
  COUNT(DISTINCT CASE WHEN type = 'pageview' THEN timestamp END) as pagesViewed,
  SUM(CASE WHEN type = 'scroll_depth' AND CAST(JSON_EXTRACT_SCALAR(data, '$.depth') AS INT64) >= 75 THEN 1 ELSE 0 END) as deepScrolls,
  SUM(CASE WHEN type = 'video_complete' THEN 1 ELSE 0 END) as videosCompleted,
  MAX(CAST(JSON_EXTRACT_SCALAR(data, '$.readingTime') AS INT64)) as totalReadingTime,
  MAX(CAST(JSON_EXTRACT_SCALAR(data, '$.scanningTime') AS INT64)) as totalScanningTime,
  MAX(CAST(JSON_EXTRACT_SCALAR(data, '$.totalTime') AS INT64)) as totalTimeOnSite,
  
  -- Content depth score (raw data for you to score)
  CASE
    WHEN COUNT(DISTINCT CASE WHEN type = 'pageview' THEN timestamp END) >= 10 THEN 'deep_researcher'
    WHEN COUNT(DISTINCT CASE WHEN type = 'pageview' THEN timestamp END) >= 5 THEN 'moderate_explorer'
    WHEN COUNT(DISTINCT CASE WHEN type = 'pageview' THEN timestamp END) >= 2 THEN 'light_browser'
    ELSE 'single_page'
  END as depthCategory,
  
  -- Engagement quality (reading vs scanning)
  CASE
    WHEN MAX(CAST(JSON_EXTRACT_SCALAR(data, '$.readingTime') AS INT64)) > 
         MAX(CAST(JSON_EXTRACT_SCALAR(data, '$.scanningTime') AS INT64)) THEN 'engaged_reader'
    ELSE 'fast_scanner'
  END as engagementQuality
  
FROM `n8n-revenueinstitute.outbound_sales.events`
WHERE _insertedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY visitorId, sessionId;


-- ============================================
-- Device Switching Detection (#19)
-- Track when visitors use multiple devices
-- ============================================
CREATE OR REPLACE VIEW `n8n-revenueinstitute.outbound_sales.multi_device_visitors` AS
SELECT 
  visitorId,
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(data, '$.deviceFingerprint')) as uniqueDevices,
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(data, '$.browserId')) as uniqueBrowsers,
  ARRAY_AGG(DISTINCT JSON_EXTRACT_SCALAR(data, '$.platform') IGNORE NULLS) as platforms,
  ARRAY_AGG(DISTINCT JSON_EXTRACT_SCALAR(data, '$.deviceFingerprint') IGNORE NULLS) as deviceFingerprints,
  MIN(TIMESTAMP_MILLIS(timestamp)) as firstSeen,
  MAX(TIMESTAMP_MILLIS(timestamp)) as lastSeen
FROM `n8n-revenueinstitute.outbound_sales.events`
WHERE visitorId IS NOT NULL
  AND type = 'pageview'
  AND JSON_EXTRACT_SCALAR(data, '$.deviceFingerprint') IS NOT NULL
GROUP BY visitorId
HAVING uniqueDevices > 1  -- Only show multi-device users
ORDER BY uniqueDevices DESC, lastSeen DESC;


-- ============================================
-- Backtracking Behavior Detection (#18)
-- Visitors going back and forth between pages
-- ============================================
CREATE OR REPLACE VIEW `n8n-revenueinstitute.outbound_sales.backtracking_visitors` AS
WITH page_sequence AS (
  SELECT 
    visitorId,
    sessionId,
    JSON_EXTRACT_SCALAR(data, '$.path') as page_path,
    JSON_EXTRACT_SCALAR(data, '$.previousPage') as previous_page,
    CAST(JSON_EXTRACT_SCALAR(data, '$.isBacktracking') AS BOOL) as isBacktracking,
    timestamp,
    ROW_NUMBER() OVER (PARTITION BY sessionId ORDER BY timestamp) as page_order
  FROM `n8n-revenueinstitute.outbound_sales.events`
  WHERE type = 'pageview'
    AND _insertedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
)
SELECT 
  visitorId,
  sessionId,
  COUNT(*) as totalPageviews,
  COUNTIF(isBacktracking) as backtrackCount,
  SAFE_DIVIDE(COUNTIF(isBacktracking), COUNT(*)) as backtrackRatio,
  ARRAY_AGG(page_path ORDER BY page_order) as pageJourney,
  MIN(TIMESTAMP_MILLIS(timestamp)) as sessionStart
FROM page_sequence
GROUP BY visitorId, sessionId
HAVING backtrackCount > 0  -- Only sessions with backtracking
ORDER BY backtrackRatio DESC;

