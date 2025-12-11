-- ============================================
-- NEW ARCHITECTURE: ANONYMOUS VISITORS FIRST
-- ============================================
-- This schema separates anonymous web visitors from identified leads
-- Flow: web_visits (anonymous) → lead (identified) via identification event
-- ============================================

-- ============================================
-- ENUMS (shared across tables)
-- ============================================

-- Event types
CREATE TYPE event_type AS ENUM (
  'page_view',
  'click',
  'scroll_depth',
  'form_start',
  'form_submit',
  'video_play',
  'video_pause',
  'video_watched',
  'video_progress',
  'video_complete',
  'focus_lost',
  'focus_gained',
  'text_copied',
  'text_pasted',
  'rage_click',
  'page_exit',
  'device_switched',
  'email_submitted',
  'email_captured',
  'identify',
  'email_sent',
  'email_bounced',
  'email_replied',
  'email_click',
  'browser_emails_scanned'
);

-- Event categories
CREATE TYPE event_category AS ENUM (
  'website',
  'email',
  'system'
);

-- Email validation status
CREATE TYPE email_status AS ENUM (
  'valid',
  'invalid',
  'catch_all',
  'disposable',
  'unknown',
  'risky'
);

-- Company size
CREATE TYPE headcount AS ENUM (
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '10001+'
);

-- Campaign status
CREATE TYPE campaign_status AS ENUM (
  'drafted',
  'active',
  'paused',
  'completed',
  'archived'
);

-- Campaign member status
CREATE TYPE campaign_member_status AS ENUM (
  'active',
  'completed',
  'bounced',
  'unsubscribed',
  'paused'
);

-- ============================================
-- TABLE 1: web_visitor (Anonymous Visitors)
-- ============================================
-- This table tracks ALL visitors before identification
-- Each visitor gets ONE record here when they first visit
-- After identification, they get moved/linked to lead table

CREATE TABLE web_visitor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Visitor Identity (anonymous)
  visitor_id TEXT UNIQUE NOT NULL, -- Generated client-side, persists in browser
  
  -- Device fingerprinting for cross-device tracking
  device_fingerprint TEXT,
  browser_id TEXT,
  
  -- Discovery & Attribution
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_page TEXT, -- Landing page URL
  first_referrer TEXT, -- Original referrer
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  fbclid TEXT,
  
  -- Behavioral Aggregates (updated as they browse)
  total_sessions INTEGER DEFAULT 1,
  total_pageviews INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_active_time INTEGER DEFAULT 0, -- seconds
  max_scroll_depth INTEGER DEFAULT 0, -- percentage
  forms_started INTEGER DEFAULT 0,
  forms_submitted INTEGER DEFAULT 0,
  videos_watched INTEGER DEFAULT 0,
  
  -- Last Activity
  last_seen_at TIMESTAMPTZ,
  last_page TEXT,
  
  -- Device & Location (from first visit)
  device TEXT,
  browser TEXT,
  operating_system TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  timezone TEXT,
  
  -- Identification Status
  is_identified BOOLEAN DEFAULT FALSE,
  identified_at TIMESTAMPTZ, -- When they became a lead
  lead_id UUID, -- Reference to lead table after identification
  
  -- Email Detection (before full identification) - Store ALL hash formats
  email_hashes JSONB, -- All email hashes: {sha256: [...], sha1: [...], md5: [...]}
  email_domains TEXT[], -- All detected email domains (array)
  
  -- Intent Signals (calculated)
  intent_score FLOAT DEFAULT 0,
  engagement_level TEXT, -- 'cold', 'warm', 'hot', 'burning'
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key to lead (set after identification)
  CONSTRAINT fk_lead
    FOREIGN KEY (lead_id)
    REFERENCES lead(id)
    ON DELETE SET NULL
);

-- Indexes for web_visitor
CREATE INDEX idx_web_visitor_visitor_id ON web_visitor(visitor_id);
CREATE INDEX idx_web_visitor_is_identified ON web_visitor(is_identified);
CREATE INDEX idx_web_visitor_lead_id ON web_visitor(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_web_visitor_first_seen ON web_visitor(first_seen_at DESC);
CREATE INDEX idx_web_visitor_last_seen ON web_visitor(last_seen_at DESC);
CREATE INDEX idx_web_visitor_email_hashes ON web_visitor USING GIN(email_hashes) WHERE email_hashes IS NOT NULL;
CREATE INDEX idx_web_visitor_email_domains ON web_visitor USING GIN(email_domains) WHERE email_domains IS NOT NULL;
CREATE INDEX idx_web_visitor_intent_score ON web_visitor(intent_score DESC);
CREATE INDEX idx_web_visitor_device_fingerprint ON web_visitor(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

-- ============================================
-- TABLE 2: lead (Identified Visitors ONLY)
-- ============================================
-- This table ONLY contains visitors who have been identified
-- No anonymous visitors here anymore!

CREATE TABLE lead (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity (all optional until identified)
  first_name TEXT,
  last_name TEXT,
  work_email TEXT,
  personal_email TEXT,
  
  -- Email hashes for matching (store ALL formats for best matching)
  email_hashes JSONB, -- {sha256: [...], sha1: [...], md5: [...]}
  
  phone TEXT,
  linkedin_url TEXT,
  
  -- Job Info
  job_title TEXT,
  job_seniority TEXT,
  job_department TEXT,
  
  -- Company Info
  company_name TEXT,
  company_website TEXT,
  company_linkedin TEXT,
  company_description TEXT,
  company_headcount headcount,
  company_revenue TEXT,
  company_industry TEXT,
  company_address TEXT,
  personal_address TEXT,
  
  -- Email Validation
  email_status email_status,
  
  -- Tracking
  tracking_id TEXT UNIQUE, -- Short ID for email campaigns (e.g., 'abc123')
  
  -- Link back to anonymous history
  original_visitor_id TEXT, -- The visitor_id before identification
  
  -- Identification metadata
  identified_at TIMESTAMPTZ, -- When this visitor was first identified
  identification_method TEXT, -- 'email_capture', 'form_submit', 'utm_param', 'api', etc.
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lead
CREATE INDEX idx_lead_tracking_id ON lead(tracking_id) WHERE tracking_id IS NOT NULL;
CREATE INDEX idx_lead_work_email ON lead(work_email) WHERE work_email IS NOT NULL;
CREATE INDEX idx_lead_personal_email ON lead(personal_email) WHERE personal_email IS NOT NULL;
CREATE INDEX idx_lead_email_hashes ON lead USING GIN(email_hashes) WHERE email_hashes IS NOT NULL;
CREATE INDEX idx_lead_updated_at ON lead(updated_at DESC);
CREATE INDEX idx_lead_original_visitor_id ON lead(original_visitor_id) WHERE original_visitor_id IS NOT NULL;
CREATE INDEX idx_lead_identified_at ON lead(identified_at DESC);

-- ============================================
-- TABLE 3: session (Browsing Sessions)
-- ============================================
-- Sessions can belong to EITHER anonymous visitors OR identified leads

CREATE TABLE session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership: EITHER web_visit_id OR lead_id (not both)
  web_visit_id UUID, -- If still anonymous
  lead_id UUID, -- If identified
  
  -- Session timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration INTEGER, -- seconds
  active_time INTEGER, -- seconds of engagement
  
  -- Entry/Exit
  first_page TEXT,
  last_page TEXT,
  entry_referrer TEXT,
  
  -- Session metrics
  pageviews INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  max_scroll_depth INTEGER DEFAULT 0,
  forms_started INTEGER DEFAULT 0,
  forms_submitted INTEGER DEFAULT 0,
  videos_watched INTEGER DEFAULT 0,
  
  -- Device & Location
  device TEXT,
  browser TEXT,
  operating_system TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  
  -- Engagement
  engagement_score FLOAT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_web_visit
    FOREIGN KEY (web_visit_id)
    REFERENCES web_visits(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_lead
    FOREIGN KEY (lead_id)
    REFERENCES lead(id)
    ON DELETE CASCADE,
    
  -- Ensure only one foreign key is set
  CONSTRAINT check_session_owner CHECK (
    (web_visit_id IS NOT NULL AND lead_id IS NULL) OR
    (web_visit_id IS NULL AND lead_id IS NOT NULL)
  )
);

-- Indexes for session
CREATE INDEX idx_session_web_visit_id ON session(web_visit_id) WHERE web_visit_id IS NOT NULL;
CREATE INDEX idx_session_lead_id ON session(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_session_start_time ON session(start_time DESC);
CREATE INDEX idx_session_web_visit_start ON session(web_visit_id, start_time DESC) WHERE web_visit_id IS NOT NULL;
CREATE INDEX idx_session_lead_start ON session(lead_id, start_time DESC) WHERE lead_id IS NOT NULL;

-- ============================================
-- TABLE 4: event (All Events)
-- ============================================
-- Events can belong to EITHER anonymous visitors OR identified leads

CREATE TABLE event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event type
  category event_category NOT NULL,
  type event_type NOT NULL,
  
  -- Ownership: EITHER web_visit_id OR lead_id (not both)
  session_id UUID NOT NULL,
  web_visit_id UUID, -- If still anonymous
  lead_id UUID, -- If identified
  
  -- Event context
  url TEXT,
  referrer TEXT,
  data JSON, -- Flexible event data
  
  -- Server enrichment
  ip_address TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  timezone TEXT,
  continent TEXT,
  postal_code TEXT,
  metro_code TEXT,
  latitude TEXT,
  longitude TEXT,
  
  -- Network
  user_agent TEXT,
  default_language TEXT,
  colo TEXT,
  asn NUMERIC,
  organization_identifier TEXT,
  company_identifier TEXT,
  
  -- Request context
  referer_header TEXT,
  url_parms TEXT, -- JSON string of all URL params
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  fbclid TEXT,
  device_type TEXT,
  
  -- Security
  is_eu_country BOOLEAN,
  tls_version TEXT,
  tls_cipher TEXT,
  http_protocol TEXT,
  
  -- Foreign keys to campaigns
  campaign_id UUID,
  message_id UUID,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_session
    FOREIGN KEY (session_id)
    REFERENCES session(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_web_visit
    FOREIGN KEY (web_visit_id)
    REFERENCES web_visits(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_lead
    FOREIGN KEY (lead_id)
    REFERENCES lead(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_campaign
    FOREIGN KEY (campaign_id)
    REFERENCES campaign(id)
    ON DELETE NO ACTION,
    
  CONSTRAINT fk_message
    FOREIGN KEY (message_id)
    REFERENCES campaign_message(id)
    ON DELETE NO ACTION,
    
  -- Ensure only one owner (either web_visit or lead)
  CONSTRAINT check_event_owner CHECK (
    (web_visit_id IS NOT NULL AND lead_id IS NULL) OR
    (web_visit_id IS NULL AND lead_id IS NOT NULL)
  )
);

-- Indexes for event
CREATE INDEX idx_event_web_visit_id ON event(web_visit_id) WHERE web_visit_id IS NOT NULL;
CREATE INDEX idx_event_lead_id ON event(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_event_session_id ON event(session_id);
CREATE INDEX idx_event_type ON event(type);
CREATE INDEX idx_event_category ON event(category);
CREATE INDEX idx_event_created_at ON event(created_at DESC);
CREATE INDEX idx_event_web_visit_created ON event(web_visit_id, created_at DESC) WHERE web_visit_id IS NOT NULL;
CREATE INDEX idx_event_lead_created ON event(lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_event_lead_type_created ON event(lead_id, type, created_at DESC) WHERE lead_id IS NOT NULL;

-- ============================================
-- TABLE 5: campaign
-- ============================================

CREATE TABLE campaign (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name TEXT NOT NULL,
  smartlead_id TEXT NOT NULL,
  status campaign_status NOT NULL DEFAULT 'drafted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLE 6: campaign_message
-- ============================================

CREATE TABLE campaign_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  smartlead_id TEXT NOT NULL,
  sequence_step NUMERIC NOT NULL,
  variant_id NUMERIC NOT NULL,
  email_subject TEXT NOT NULL,
  email_body TEXT NOT NULL,
  word_count NUMERIC,
  link_count NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_campaign
    FOREIGN KEY (campaign_id)
    REFERENCES campaign(id)
    ON DELETE CASCADE
);

-- ============================================
-- TABLE 7: campaign_member
-- ============================================
-- Campaign members are ONLY identified leads

CREATE TABLE campaign_member (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL, -- Only identified leads can be in campaigns
  campaign_id UUID NOT NULL,
  member_status campaign_member_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_lead
    FOREIGN KEY (lead_id)
    REFERENCES lead(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_campaign
    FOREIGN KEY (campaign_id)
    REFERENCES campaign(id)
    ON DELETE CASCADE,
    
  -- One lead per campaign
  UNIQUE(lead_id, campaign_id)
);

-- Indexes for campaign_member
CREATE INDEX idx_campaign_member_lead_id ON campaign_member(lead_id);
CREATE INDEX idx_campaign_member_campaign_id ON campaign_member(campaign_id);
CREATE INDEX idx_campaign_member_status ON campaign_member(member_status);

-- ============================================
-- TABLE 8: session_id_map (Identity Resolution)
-- ============================================
-- Maps between anonymous sessions and identified sessions

CREATE TABLE session_id_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  original_visitor_id TEXT, -- Anonymous visitor ID
  identified_visitor_id TEXT, -- Identified visitor ID (tracking_id)
  email TEXT,
  email_hash TEXT,
  identified_at TIMESTAMPTZ,
  id_method TEXT, -- How they were identified
  event_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_session
    FOREIGN KEY (session_id)
    REFERENCES session(id)
    ON DELETE CASCADE
);

-- Indexes for session_id_map
CREATE INDEX idx_session_id_map_session ON session_id_map(session_id);
CREATE INDEX idx_session_id_map_original ON session_id_map(original_visitor_id) WHERE original_visitor_id IS NOT NULL;
CREATE INDEX idx_session_id_map_identified ON session_id_map(identified_visitor_id) WHERE identified_visitor_id IS NOT NULL;
CREATE INDEX idx_session_id_map_email_hash ON session_id_map(email_hash) WHERE email_hash IS NOT NULL;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to add email hashes to web_visitor or lead
CREATE OR REPLACE FUNCTION add_email_hashes(
  p_table_name TEXT, -- 'web_visitor' or 'lead'
  p_record_id UUID,
  p_sha256 TEXT,
  p_sha1 TEXT DEFAULT NULL,
  p_md5 TEXT DEFAULT NULL,
  p_email_domain TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_current_hashes JSONB;
  v_new_hashes JSONB;
  v_current_domains TEXT[];
BEGIN
  -- Get current hashes
  IF p_table_name = 'web_visitor' THEN
    SELECT email_hashes, email_domains INTO v_current_hashes, v_current_domains
    FROM web_visitor WHERE id = p_record_id;
  ELSIF p_table_name = 'lead' THEN
    SELECT email_hashes INTO v_current_hashes FROM lead WHERE id = p_record_id;
  ELSE
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;
  
  -- Initialize if NULL
  IF v_current_hashes IS NULL THEN
    v_current_hashes := '{"sha256": [], "sha1": [], "md5": []}'::jsonb;
  END IF;
  
  -- Add new hashes (avoiding duplicates)
  v_new_hashes := v_current_hashes;
  
  IF p_sha256 IS NOT NULL AND NOT v_current_hashes->'sha256' @> to_jsonb(ARRAY[p_sha256]) THEN
    v_new_hashes := jsonb_set(v_new_hashes, '{sha256}', 
      (v_new_hashes->'sha256')::jsonb || to_jsonb(p_sha256));
  END IF;
  
  IF p_sha1 IS NOT NULL AND NOT v_current_hashes->'sha1' @> to_jsonb(ARRAY[p_sha1]) THEN
    v_new_hashes := jsonb_set(v_new_hashes, '{sha1}', 
      (v_new_hashes->'sha1')::jsonb || to_jsonb(p_sha1));
  END IF;
  
  IF p_md5 IS NOT NULL AND NOT v_current_hashes->'md5' @> to_jsonb(ARRAY[p_md5]) THEN
    v_new_hashes := jsonb_set(v_new_hashes, '{md5}', 
      (v_new_hashes->'md5')::jsonb || to_jsonb(p_md5));
  END IF;
  
  -- Update the record
  IF p_table_name = 'web_visitor' THEN
    -- Add domain to array (avoiding duplicates)
    IF p_email_domain IS NOT NULL THEN
      v_current_domains := COALESCE(v_current_domains, ARRAY[]::TEXT[]);
      IF NOT (p_email_domain = ANY(v_current_domains)) THEN
        v_current_domains := array_append(v_current_domains, p_email_domain);
      END IF;
    END IF;
    
    UPDATE web_visitor 
    SET email_hashes = v_new_hashes,
        email_domains = v_current_domains,
        updated_at = NOW()
    WHERE id = p_record_id;
  ELSIF p_table_name = 'lead' THEN
    UPDATE lead 
    SET email_hashes = v_new_hashes,
        updated_at = NOW()
    WHERE id = p_record_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to find visitor by ANY email hash
CREATE OR REPLACE FUNCTION find_visitor_by_email_hash(
  p_sha256 TEXT DEFAULT NULL,
  p_sha1 TEXT DEFAULT NULL,
  p_md5 TEXT DEFAULT NULL
)
RETURNS TABLE(visitor_id TEXT, is_identified BOOLEAN, lead_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT wv.visitor_id, wv.is_identified, wv.lead_id
  FROM web_visitor wv
  WHERE 
    (p_sha256 IS NOT NULL AND wv.email_hashes->'sha256' @> to_jsonb(p_sha256)) OR
    (p_sha1 IS NOT NULL AND wv.email_hashes->'sha1' @> to_jsonb(p_sha1)) OR
    (p_md5 IS NOT NULL AND wv.email_hashes->'md5' @> to_jsonb(p_md5))
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to find lead by ANY email hash
CREATE OR REPLACE FUNCTION find_lead_by_email_hash(
  p_sha256 TEXT DEFAULT NULL,
  p_sha1 TEXT DEFAULT NULL,
  p_md5 TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, work_email TEXT, first_name TEXT, last_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.work_email, l.first_name, l.last_name
  FROM lead l
  WHERE 
    (p_sha256 IS NOT NULL AND l.email_hashes->'sha256' @> to_jsonb(p_sha256)) OR
    (p_sha1 IS NOT NULL AND l.email_hashes->'sha1' @> to_jsonb(p_sha1)) OR
    (p_md5 IS NOT NULL AND l.email_hashes->'md5' @> to_jsonb(p_md5))
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to identify a visitor (move from web_visitor to lead)
CREATE OR REPLACE FUNCTION identify_visitor(
  p_visitor_id TEXT,
  p_email TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_identification_method TEXT DEFAULT 'unknown'
)
RETURNS UUID AS $$
DECLARE
  v_lead_id UUID;
  v_web_visit_id UUID;
BEGIN
  -- Get the web_visit record
  SELECT id INTO v_web_visit_id
  FROM web_visits
  WHERE visitor_id = p_visitor_id
  LIMIT 1;
  
  IF v_web_visit_id IS NULL THEN
    RAISE EXCEPTION 'Visitor not found: %', p_visitor_id;
  END IF;
  
  -- Check if lead already exists with this email
  SELECT id INTO v_lead_id
  FROM lead
  WHERE work_email = p_email OR personal_email = p_email
  LIMIT 1;
  
  IF v_lead_id IS NULL THEN
    -- Create new lead
    INSERT INTO lead (
      work_email,
      first_name,
      last_name,
      original_visitor_id,
      identified_at,
      identification_method
    ) VALUES (
      p_email,
      p_first_name,
      p_last_name,
      p_visitor_id,
      NOW(),
      p_identification_method
    )
    RETURNING id INTO v_lead_id;
  END IF;
  
  -- Update web_visits record
  UPDATE web_visits
  SET 
    is_identified = TRUE,
    identified_at = NOW(),
    lead_id = v_lead_id,
    updated_at = NOW()
  WHERE id = v_web_visit_id;
  
  -- Reassign all sessions from web_visit to lead
  UPDATE session
  SET 
    lead_id = v_lead_id,
    web_visit_id = NULL,
    updated_at = NOW()
  WHERE web_visit_id = v_web_visit_id;
  
  -- Reassign all events from web_visit to lead
  UPDATE event
  SET 
    lead_id = v_lead_id,
    web_visit_id = NULL,
    updated_at = NOW()
  WHERE web_visit_id = v_web_visit_id;
  
  RETURN v_lead_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create web_visit
CREATE OR REPLACE FUNCTION get_or_create_web_visit(
  p_visitor_id TEXT,
  p_device_fingerprint TEXT DEFAULT NULL,
  p_browser_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_web_visit_id UUID;
BEGIN
  -- Try to find existing web_visit
  SELECT id INTO v_web_visit_id
  FROM web_visits
  WHERE visitor_id = p_visitor_id
  LIMIT 1;
  
  IF v_web_visit_id IS NULL THEN
    -- Create new web_visit
    INSERT INTO web_visits (
      visitor_id,
      device_fingerprint,
      browser_id,
      first_seen_at,
      last_seen_at
    ) VALUES (
      p_visitor_id,
      p_device_fingerprint,
      p_browser_id,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_web_visit_id;
  ELSE
    -- Update last seen
    UPDATE web_visits
    SET 
      last_seen_at = NOW(),
      updated_at = NOW()
    WHERE id = v_web_visit_id;
  END IF;
  
  RETURN v_web_visit_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- View: All visitors (anonymous + identified)
CREATE OR REPLACE VIEW all_visitors AS
SELECT 
  wv.id as visitor_record_id,
  wv.visitor_id,
  wv.is_identified,
  wv.first_seen_at,
  wv.last_seen_at,
  wv.total_sessions,
  wv.total_pageviews,
  wv.intent_score,
  wv.engagement_level,
  -- Lead data (if identified)
  l.id as lead_id,
  l.work_email,
  l.first_name,
  l.last_name,
  l.company_name,
  l.tracking_id,
  l.identified_at,
  l.identification_method
FROM web_visits wv
LEFT JOIN lead l ON wv.lead_id = l.id;

-- View: Anonymous visitors (not yet identified)
CREATE OR REPLACE VIEW anonymous_visitors AS
SELECT *
FROM web_visits
WHERE is_identified = FALSE;

-- View: Recently identified leads
CREATE OR REPLACE VIEW recently_identified AS
SELECT 
  l.*,
  wv.visitor_id as original_visitor_id,
  wv.first_seen_at as first_visit,
  wv.total_sessions as sessions_before_id,
  wv.total_pageviews as pageviews_before_id
FROM lead l
INNER JOIN web_visits wv ON l.id = wv.lead_id
WHERE l.identified_at >= NOW() - INTERVAL '7 days'
ORDER BY l.identified_at DESC;

-- View: High-intent anonymous visitors (ready for identification)
CREATE OR REPLACE VIEW high_intent_anonymous AS
SELECT 
  wv.*,
  (SELECT COUNT(*) FROM session WHERE web_visit_id = wv.id) as session_count,
  (SELECT MAX(created_at) FROM event WHERE web_visit_id = wv.id) as last_event_at
FROM web_visits wv
WHERE 
  wv.is_identified = FALSE
  AND wv.intent_score >= 50
  AND wv.last_seen_at >= NOW() - INTERVAL '7 days'
ORDER BY wv.intent_score DESC, wv.last_seen_at DESC;

-- ============================================
-- TRIGGERS FOR AUTO-UPDATING
-- ============================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER update_web_visits_updated_at BEFORE UPDATE ON web_visits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lead_updated_at BEFORE UPDATE ON lead FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_session_updated_at BEFORE UPDATE ON session FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_event_updated_at BEFORE UPDATE ON event FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaign_updated_at BEFORE UPDATE ON campaign FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaign_message_updated_at BEFORE UPDATE ON campaign_message FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaign_member_updated_at BEFORE UPDATE ON campaign_member FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_session_id_map_updated_at BEFORE UPDATE ON session_id_map FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMPLETE!
-- ============================================
-- This schema provides:
-- 1. Clear separation between anonymous and identified visitors
-- 2. Proper foreign key relationships
-- 3. Flexible event tracking for both states
-- 4. Easy identification transition with helper function
-- 5. Analytics views for both states
-- ============================================
