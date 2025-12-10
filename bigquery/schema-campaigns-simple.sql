-- ============================================
-- SIMPLIFIED CAMPAIGN TRACKING
-- ============================================
-- Only what you actually need:
-- - Which leads are in which campaigns
-- - Campaign status
-- Everything else comes from events/leads tables
-- ============================================

-- ============================================
-- TABLE 1: campaigns (Campaign Metadata)
-- ============================================
CREATE TABLE IF NOT EXISTS `outbound_sales.campaigns` (
  campaignId STRING NOT NULL,
  campaignName STRING NOT NULL,
  smartleadCampaignId STRING,      -- Reference to Smartlead campaign
  status STRING,                   -- 'active', 'paused', 'completed'
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY campaignId
OPTIONS(
  description="Campaign metadata - one row per campaign"
);

-- ============================================
-- TABLE 2: campaign_members (Lead-to-Campaign Assignment)
-- ============================================
CREATE TABLE IF NOT EXISTS `outbound_sales.campaign_members` (
  trackingId STRING NOT NULL,      -- Links to leads.trackingId
  campaignId STRING NOT NULL,      -- Links to campaigns.campaignId
  status STRING,                   -- 'active', 'completed', 'unsubscribed'
  addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY trackingId, campaignId
OPTIONS(
  description="Many-to-many: which leads are in which campaigns"
);

-- ============================================
-- VIEW: Campaign Performance (from events table)
-- ============================================
CREATE OR REPLACE VIEW `outbound_sales.v_campaign_performance` AS
SELECT 
  c.campaignId,
  c.campaignName,
  c.status as campaignStatus,
  
  -- Member counts
  COUNT(DISTINCT cm.trackingId) as totalMembers,
  COUNT(DISTINCT CASE WHEN cm.status = 'active' THEN cm.trackingId END) as activeMembers,
  
  -- Email stats from events table
  COUNT(DISTINCT CASE WHEN e.type = 'email_sent' AND e.campaignId = c.campaignId THEN e.visitorId END) as emailsSent,
  COUNT(DISTINCT CASE WHEN e.type = 'email_opened' AND e.campaignId = c.campaignId THEN e.visitorId END) as emailsOpened,
  COUNT(DISTINCT CASE WHEN e.type = 'email_clicked' AND e.campaignId = c.campaignId THEN e.visitorId END) as emailsClicked,
  
  -- Website visits from events table
  COUNT(DISTINCT CASE WHEN e.type = 'pageview' AND e.visitorId IN (
    SELECT trackingId FROM `outbound_sales.campaign_members` WHERE campaignId = c.campaignId
  ) THEN e.visitorId END) as websiteVisits,
  
  -- Intent scores from lead_profiles
  COUNT(DISTINCT CASE WHEN lp.intentScore >= 70 AND cm.trackingId = lp.visitorId THEN cm.trackingId END) as highIntentLeads,
  AVG(lp.intentScore) as avgIntentScore
  
FROM `outbound_sales.campaigns` c
LEFT JOIN `outbound_sales.campaign_members` cm ON c.campaignId = cm.campaignId
LEFT JOIN `outbound_sales.events` e ON cm.trackingId = e.visitorId
LEFT JOIN `outbound_sales.lead_profiles` lp ON cm.trackingId = lp.visitorId
GROUP BY c.campaignId, c.campaignName, c.status;

-- ============================================
-- VIEW: Lead's Campaigns
-- ============================================
CREATE OR REPLACE VIEW `outbound_sales.v_lead_campaigns` AS
SELECT 
  l.trackingId,
  l.email,
  l.person_name,
  cm.campaignId,
  c.campaignName,
  cm.status,
  cm.addedAt,
  lp.intentScore
FROM `outbound_sales.leads` l
INNER JOIN `outbound_sales.campaign_members` cm ON l.trackingId = cm.trackingId
INNER JOIN `outbound_sales.campaigns` c ON cm.campaignId = c.campaignId
LEFT JOIN `outbound_sales.lead_profiles` lp ON l.trackingId = lp.visitorId;

