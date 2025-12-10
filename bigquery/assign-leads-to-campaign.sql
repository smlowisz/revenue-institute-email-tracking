-- ============================================
-- ASSIGN LEADS TO CAMPAIGN
-- ============================================
-- Purpose: Bulk assign leads to a campaign based on filters
-- Usage: Modify the WHERE clause to select your target leads
-- ============================================

-- ============================================
-- STEP 1: Create the campaign (if new)
-- ============================================
INSERT INTO `outbound_sales.campaigns` (
  campaignId,
  campaignName,
  smartleadCampaignId,
  status
)
VALUES (
  'q1-outreach-2025',              -- campaignId (unique, lowercase, hyphenated)
  'Q1 Outreach Campaign 2025',     -- campaignName (human-readable)
  'smartlead_12345',               -- smartleadCampaignId (from Smartlead)
  'active'                         -- status
);

-- ============================================
-- STEP 2: Assign leads to campaign
-- ============================================
-- Modify the WHERE clause to target your desired leads
-- Examples:
--   - Job title filter: WHERE job_title LIKE '%VP%'
--   - Industry filter: WHERE industry = 'SaaS'
--   - Company size: WHERE company_size IN ('51-200', '201-500')
--   - Multiple criteria: WHERE job_title LIKE '%VP%' AND industry = 'Technology'
--   - Custom list: WHERE email IN ('email1@company.com', 'email2@company.com')
-- ============================================

INSERT INTO `outbound_sales.campaign_members` (
  trackingId,
  campaignId,
  status
)
SELECT 
  l.trackingId,
  'q1-outreach-2025' as campaignId,
  'active' as status
FROM `outbound_sales.leads` l
WHERE l.trackingId IS NOT NULL
  -- ============================================
  -- 🔥 MODIFY THIS FILTER FOR YOUR CAMPAIGN 🔥
  -- ============================================
  AND l.job_title LIKE '%VP%'
  AND l.industry = 'SaaS'
  AND l.company_size IN ('51-200', '201-500', '501-1000')
  -- ============================================
  
  -- Don't add duplicates
  AND NOT EXISTS (
    SELECT 1 FROM `outbound_sales.campaign_members` cm
    WHERE cm.trackingId = l.trackingId
      AND cm.campaignId = 'q1-outreach-2025'
  )
LIMIT 10000;  -- Safety limit, adjust as needed

-- ============================================
-- STEP 3: Verify assignment
-- ============================================
SELECT 
  campaignName,
  COUNT(*) as totalMembers,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as activeMembers
FROM `outbound_sales.campaign_members`
WHERE campaignId = 'q1-outreach-2025'
GROUP BY campaignName;

-- ============================================
-- ALTERNATIVE: Assign from CSV/spreadsheet
-- ============================================
-- If you have a list of emails/trackingIds in a CSV:
-- 1. Upload CSV to BigQuery as temporary table
-- 2. Use this query:
-- ============================================

-- INSERT INTO `outbound_sales.campaign_members` (...)
-- SELECT 
--   l.trackingId,
--   'q1-outreach-2025',
--   'Q1 Outreach Campaign 2025',
--   1,
--   'active',
--   CURRENT_TIMESTAMP()
-- FROM `outbound_sales.leads` l
-- INNER JOIN `outbound_sales.temp_campaign_list` t
--   ON l.email = t.email
-- WHERE l.trackingId IS NOT NULL;

-- ============================================
-- COMMON FILTERS (Copy/paste these)
-- ============================================

-- Filter by job title
-- AND l.job_title LIKE '%VP%'
-- AND l.job_title LIKE '%Director%'
-- AND l.job_title LIKE '%C-level%'

-- Filter by seniority
-- AND l.seniority IN ('VP', 'C-Level', 'Director')

-- Filter by industry
-- AND l.industry = 'SaaS'
-- AND l.industry IN ('Technology', 'Software', 'SaaS')

-- Filter by company size
-- AND l.company_size IN ('11-50', '51-200', '201-500')

-- Filter by department
-- AND l.department = 'Sales'

-- Filter by recent adds
-- AND l.inserted_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)

-- Exclude leads already in another campaign
-- AND NOT EXISTS (
--   SELECT 1 FROM `outbound_sales.campaign_members` cm
--   WHERE cm.trackingId = l.trackingId
--     AND cm.campaignId = 'other-campaign-id'
-- )

-- Only leads who haven't visited yet (cold outreach)
-- AND NOT EXISTS (
--   SELECT 1 FROM `outbound_sales.lead_profiles` lp
--   WHERE lp.visitorId = l.trackingId
-- )

-- Only leads with high intent score
-- AND EXISTS (
--   SELECT 1 FROM `outbound_sales.lead_profiles` lp
--   WHERE lp.visitorId = l.trackingId
--     AND lp.intentScore >= 70
-- )

