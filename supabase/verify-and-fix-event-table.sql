-- ============================================
-- VERIFY AND FIX EVENT TABLE SCHEMA
-- ============================================
-- Run this in Supabase SQL Editor to ensure all columns exist
-- ============================================

-- Add any missing columns (IF NOT EXISTS is safe to run multiple times)

-- Core fields
ALTER TABLE event ADD COLUMN IF NOT EXISTS category event_category;
ALTER TABLE event ADD COLUMN IF NOT EXISTS type event_type;
ALTER TABLE event ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE event ADD COLUMN IF NOT EXISTS lead_id UUID;
ALTER TABLE event ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS data JSONB; -- Changed to JSONB for better performance
ALTER TABLE event ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS country TEXT;

-- User agent and device
ALTER TABLE event ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS "deviceType" TEXT;

-- Network
ALTER TABLE event ADD COLUMN IF NOT EXISTS colo TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS asn NUMERIC;
ALTER TABLE event ADD COLUMN IF NOT EXISTS organization_identifier TEXT;

-- Geo
ALTER TABLE event ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS continent TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS metro_code TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS latitude TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS longitude TEXT;

-- Company
ALTER TABLE event ADD COLUMN IF NOT EXISTS company_identifier TEXT;

-- Headers
ALTER TABLE event ADD COLUMN IF NOT EXISTS default_language TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS referer_header TEXT;

-- URL params
ALTER TABLE event ADD COLUMN IF NOT EXISTS url_parms TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS gclid TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS fbclid TEXT;

-- Security
ALTER TABLE event ADD COLUMN IF NOT EXISTS is_eu_country BOOLEAN;
ALTER TABLE event ADD COLUMN IF NOT EXISTS tls_version TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS tls_cipher TEXT;
ALTER TABLE event ADD COLUMN IF NOT EXISTS http_protocol TEXT;

-- Foreign keys
ALTER TABLE event ADD COLUMN IF NOT EXISTS campaign_id UUID;
ALTER TABLE event ADD COLUMN IF NOT EXISTS message_id UUID;

-- Timestamps
ALTER TABLE event ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE event ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add foreign key constraints if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_lead'
  ) THEN
    ALTER TABLE event ADD CONSTRAINT fk_lead
      FOREIGN KEY (lead_id) REFERENCES lead(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_campaign'
  ) THEN
    ALTER TABLE event ADD CONSTRAINT fk_campaign
      FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_message'
  ) THEN
    ALTER TABLE event ADD CONSTRAINT fk_message
      FOREIGN KEY (message_id) REFERENCES campaign_message(id) ON DELETE NO ACTION;
  END IF;
END $$;

-- Verify all columns exist
SELECT 
  column_name, 
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'event' 
ORDER BY ordinal_position;

-- Expected: 45+ columns listed
-- If any are missing, review your table creation

SELECT '✅ Event table schema verified!' as status;

