-- ============================================
-- EMAIL MESSAGES TABLE (Simplified)
-- ============================================
-- Purpose: Store email message templates from Smartlead
-- One row per message/variant in a campaign sequence
-- ============================================

CREATE TABLE IF NOT EXISTS `outbound_sales.email_messages` (
  -- Identifiers
  messageId STRING NOT NULL,           -- Unique message ID (from Smartlead or generated)
  smartleadMessageId STRING,           -- Reference to Smartlead message ID
  campaignId STRING NOT NULL,          -- Links to campaigns.campaignId
  
  -- Message Content
  subject STRING,                      -- Email subject line
  body STRING,                         -- Email body (HTML/text)
  
  -- Sequence Position
  sequenceStep INT64,                  -- Position in sequence (1, 2, 3...)
  delayDays INT64,                     -- Days to wait before sending this step
  
  -- A/B Testing
  isAbTest BOOL DEFAULT FALSE,         -- TRUE if this is an A/B test variant
  variantId STRING,                    -- 'A', 'B', 'C', etc. (if A/B test)
  
  -- Metadata
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY campaignId, sequenceStep
OPTIONS(
  description="Email message templates from Smartlead campaigns"
);

