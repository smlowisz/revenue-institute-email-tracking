-- ============================================
-- SESSION AGGREGATION QUERY (PostgreSQL)
-- ============================================
-- Rolls up events into session metrics
-- Run this every 5-15 minutes via cron or pg_cron
-- ============================================

-- Aggregate events into session table
INSERT INTO session (
  id,
  lead_id,
  start_time,
  end_time,
  duration,
  active_time,
  first_page,
  last_page,
  pageviews,
  clicks,
  max_scroll_depth,
  forms_started,
  forms_submitted,
  videos_watched,
  device,
  browser,
  operating_system,
  country,
  city,
  region,
  engagement_score,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid() as id,
  lead_id,
  MIN(created_at) as start_time,
  MAX(created_at) as end_time,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::integer as duration,
  
  -- Active time (from page_exit events)
  COALESCE(MAX((data->>'activeTime')::integer), 0) as active_time,
  
  -- First and last pages
  (ARRAY_AGG(url ORDER BY created_at ASC))[1] as first_page,
  (ARRAY_AGG(url ORDER BY created_at DESC))[1] as last_page,
  
  -- Event counts
  COUNT(CASE WHEN type = 'page_view' THEN 1 END)::integer as pageviews,
  COUNT(CASE WHEN type = 'click' THEN 1 END)::integer as clicks,
  
  -- Max scroll depth (from scroll_depth events)
  COALESCE(MAX((data->>'depth')::integer), 0)::integer as max_scroll_depth,
  
  -- Form interactions
  COUNT(DISTINCT CASE WHEN type = 'form_start' THEN data->>'formId' END)::integer as forms_started,
  COUNT(CASE WHEN type = 'form_submit' THEN 1 END)::integer as forms_submitted,
  
  -- Video interactions
  COUNT(CASE WHEN type = 'video_complete' THEN 1 END)::integer as videos_watched,
  
  -- Device info (from first pageview)
  (ARRAY_AGG(data->>'device' ORDER BY created_at ASC) FILTER (WHERE data->>'device' IS NOT NULL))[1] as device,
  (ARRAY_AGG(data->>'browser' ORDER BY created_at ASC) FILTER (WHERE data->>'browser' IS NOT NULL))[1] as browser,
  (ARRAY_AGG(data->>'os' ORDER BY created_at ASC) FILTER (WHERE data->>'os' IS NOT NULL))[1] as operating_system,
  
  -- Geo (from first event)
  (ARRAY_AGG(country ORDER BY created_at ASC) FILTER (WHERE country IS NOT NULL))[1] as country,
  (ARRAY_AGG(city ORDER BY created_at ASC) FILTER (WHERE city IS NOT NULL))[1] as city,
  (ARRAY_AGG(region ORDER BY created_at ASC) FILTER (WHERE region IS NOT NULL))[1] as region,
  
  -- Engagement score (simplified)
  LEAST(100, (
    COUNT(CASE WHEN type = 'page_view' THEN 1 END) * 5 +
    COUNT(CASE WHEN type = 'click' THEN 1 END) * 3 +
    COALESCE(MAX((data->>'maxScrollDepth')::integer), 0) / 2 +
    COUNT(CASE WHEN type = 'form_submit' THEN 1 END) * 30 +
    COUNT(CASE WHEN type = 'video_complete' THEN 1 END) * 20 +
    COALESCE(MAX((data->>'activeTime')::integer), 0) / 10
  ))::float as engagement_score,
  
  NOW() as created_at,
  NOW() as updated_at

FROM event
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND category = 'website' -- Only website events for session aggregation
  AND lead_id IS NOT NULL
GROUP BY lead_id, data->>'_originalSessionId'
HAVING data->>'_originalSessionId' IS NOT NULL
ON CONFLICT (id) DO NOTHING; -- Prevent duplicates if this query runs multiple times

-- ============================================
-- Alternative: Update existing sessions
-- Use this if you want to UPDATE sessions instead of INSERT
-- ============================================

/*
UPDATE session s
SET
  end_time = agg.end_time,
  duration = agg.duration,
  active_time = agg.active_time,
  last_page = agg.last_page,
  pageviews = agg.pageviews,
  clicks = agg.clicks,
  max_scroll_depth = agg.max_scroll_depth,
  forms_started = agg.forms_started,
  forms_submitted = agg.forms_submitted,
  videos_watched = agg.videos_watched,
  engagement_score = agg.engagement_score,
  updated_at = NOW()
FROM (
  SELECT 
    session_id,
    MAX(created_at) as end_time,
    EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::integer as duration,
    COALESCE(MAX((data->>'activeTime')::integer), 0) as active_time,
    (ARRAY_AGG(url ORDER BY created_at DESC))[1] as last_page,
    COUNT(CASE WHEN type = 'page_view' THEN 1 END)::integer as pageviews,
    COUNT(CASE WHEN type = 'click' THEN 1 END)::integer as clicks,
    COALESCE(MAX((data->>'depth')::integer), 0)::integer as max_scroll_depth,
    COUNT(DISTINCT CASE WHEN type = 'form_start' THEN data->>'formId' END)::integer as forms_started,
    COUNT(CASE WHEN type = 'form_submit' THEN 1 END)::integer as forms_submitted,
    COUNT(CASE WHEN type = 'video_complete' THEN 1 END)::integer as videos_watched,
    LEAST(100, (
      COUNT(CASE WHEN type = 'page_view' THEN 1 END) * 5 +
      COUNT(CASE WHEN type = 'click' THEN 1 END) * 3 +
      COALESCE(MAX((data->>'maxScrollDepth')::integer), 0) / 2 +
      COUNT(CASE WHEN type = 'form_submit' THEN 1 END) * 30 +
      COUNT(CASE WHEN type = 'video_complete' THEN 1 END) * 20
    ))::float as engagement_score
  FROM event
  WHERE created_at >= NOW() - INTERVAL '1 hour'
    AND category = 'website'
  GROUP BY session_id
) agg
WHERE s.id = agg.session_id;
*/

