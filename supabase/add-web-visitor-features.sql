-- ============================================
-- ADD web_visitor ARCHITECTURE TO EXISTING TABLES
-- ============================================
-- This script modifies existing tables and adds new features
-- Run this AFTER you have your base tables created
-- ============================================

-- ============================================
-- STEP 1: Create web_visitor table (if not exists)
-- ============================================
-- Skip if table already exists to avoid column conflicts

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'web_visitor') THEN
    CREATE TABLE web_visitor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Visitor Identity (anonymous)
  visitor_id TEXT UNIQUE NOT NULL,
  
  -- Device fingerprinting
  device_fingerprint TEXT,
  browser_id TEXT,
  
  -- Discovery & Attribution
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_page TEXT,
  first_referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  fbclid TEXT,
  
  -- Behavioral Aggregates
  total_sessions INTEGER DEFAULT 1,
  total_pageviews INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_active_time INTEGER DEFAULT 0,
  max_scroll_depth INTEGER DEFAULT 0,
  forms_started INTEGER DEFAULT 0,
  forms_submitted INTEGER DEFAULT 0,
  videos_watched INTEGER DEFAULT 0,
  
  -- Last Activity
  last_seen_at TIMESTAMPTZ,
  last_page TEXT,
  
  -- Device & Location
  device TEXT,
  browser TEXT,
  operating_system TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  timezone TEXT,
  
  -- Identification Status
  is_identified BOOLEAN DEFAULT FALSE,
  identified_at TIMESTAMPTZ,
  lead_id UUID,
  
  -- Email Detection - Store ALL hash formats
  email_hash TEXT,
  email_hashes JSONB,
  email_domain TEXT,
  email_domains TEXT[],
  
  -- Intent Signals
  intent_score FLOAT DEFAULT 0,
  engagement_level TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- ============================================
-- STEP 2: Modify lead table (add new columns)
-- ============================================

-- Add columns only if they don't exist
DO $$
BEGIN
  -- Add email hashes to lead table
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lead' AND column_name = 'email_hashes') THEN
    ALTER TABLE lead ADD COLUMN email_hashes JSONB;
  END IF;

  -- Add original visitor tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lead' AND column_name = 'original_visitor_id') THEN
    ALTER TABLE lead ADD COLUMN original_visitor_id TEXT;
  END IF;

  -- Add identification metadata
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lead' AND column_name = 'identified_at') THEN
    ALTER TABLE lead ADD COLUMN identified_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'lead' AND column_name = 'identification_method') THEN
    ALTER TABLE lead ADD COLUMN identification_method TEXT;
  END IF;
END $$;

-- ============================================
-- STEP 3: Modify event table (add web_visitor_id)
-- ============================================

-- Add web_visitor_id column only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'event' AND column_name = 'web_visitor_id') THEN
    ALTER TABLE event ADD COLUMN web_visitor_id UUID;
  END IF;
END $$;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_event_web_visitor'
  ) THEN
    ALTER TABLE event
    ADD CONSTRAINT fk_event_web_visitor
    FOREIGN KEY (web_visitor_id)
    REFERENCES web_visitor(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add CHECK constraint (either web_visitor_id OR lead_id, not both)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_event_owner'
  ) THEN
    ALTER TABLE event
    ADD CONSTRAINT check_event_owner CHECK (
      (web_visitor_id IS NOT NULL AND lead_id IS NULL) OR
      (web_visitor_id IS NULL AND lead_id IS NOT NULL)
    );
  END IF;
END $$;

-- ============================================
-- STEP 4: Modify session table (add web_visitor_id)
-- ============================================

-- Add web_visitor_id column only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'session' AND column_name = 'web_visitor_id') THEN
    ALTER TABLE session ADD COLUMN web_visitor_id UUID;
  END IF;
END $$;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_session_web_visitor'
  ) THEN
    ALTER TABLE session
    ADD CONSTRAINT fk_session_web_visitor
    FOREIGN KEY (web_visitor_id)
    REFERENCES web_visitor(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add CHECK constraint (either web_visitor_id OR lead_id, not both)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_session_owner'
  ) THEN
    ALTER TABLE session
    ADD CONSTRAINT check_session_owner CHECK (
      (web_visitor_id IS NOT NULL AND lead_id IS NULL) OR
      (web_visitor_id IS NULL AND lead_id IS NOT NULL)
    );
  END IF;
END $$;

-- ============================================
-- STEP 5: Add foreign key from web_visitor to lead
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_web_visitor_lead'
  ) THEN
    ALTER TABLE web_visitor
    ADD CONSTRAINT fk_web_visitor_lead
    FOREIGN KEY (lead_id)
    REFERENCES lead(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================

-- web_visitor indexes
CREATE INDEX IF NOT EXISTS idx_web_visitor_visitor_id ON web_visitor(visitor_id);
CREATE INDEX IF NOT EXISTS idx_web_visitor_is_identified ON web_visitor(is_identified);
CREATE INDEX IF NOT EXISTS idx_web_visitor_lead_id ON web_visitor(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_visitor_first_seen ON web_visitor(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_visitor_last_seen ON web_visitor(last_seen_at DESC);

-- Only create email_hashes index if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'web_visitor' AND column_name = 'email_hashes') THEN
    CREATE INDEX IF NOT EXISTS idx_web_visitor_email_hashes 
    ON web_visitor USING GIN(email_hashes) WHERE email_hashes IS NOT NULL;
  END IF;
END $$;

-- Only create email_domains index if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'web_visitor' AND column_name = 'email_domains') THEN
    CREATE INDEX IF NOT EXISTS idx_web_visitor_email_domains 
    ON web_visitor USING GIN(email_domains) WHERE email_domains IS NOT NULL;
  END IF;
END $$;

-- Legacy email_hash index (if using old schema)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'web_visitor' AND column_name = 'email_hash') THEN
    CREATE INDEX IF NOT EXISTS idx_web_visitor_email_hash 
    ON web_visitor(email_hash) WHERE email_hash IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_web_visitor_intent_score ON web_visitor(intent_score DESC);
CREATE INDEX IF NOT EXISTS idx_web_visitor_device_fingerprint ON web_visitor(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

-- lead table indexes (new columns)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'lead' AND column_name = 'email_hashes') THEN
    CREATE INDEX IF NOT EXISTS idx_lead_email_hashes 
    ON lead USING GIN(email_hashes) WHERE email_hashes IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_original_visitor_id ON lead(original_visitor_id) WHERE original_visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_identified_at ON lead(identified_at DESC);

-- event table indexes (web_visitor_id)
CREATE INDEX IF NOT EXISTS idx_event_web_visitor_id ON event(web_visitor_id) WHERE web_visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_web_visitor_created ON event(web_visitor_id, created_at DESC) WHERE web_visitor_id IS NOT NULL;

-- session table indexes (web_visitor_id)
CREATE INDEX IF NOT EXISTS idx_session_web_visitor_id ON session(web_visitor_id) WHERE web_visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_web_visitor_start ON session(web_visitor_id, start_time DESC) WHERE web_visitor_id IS NOT NULL;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to add email hashes to web_visitor or lead
CREATE OR REPLACE FUNCTION add_email_hashes(
  p_table_name TEXT,
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
  v_has_hashes_column BOOLEAN;
BEGIN
  -- Check if email_hashes column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = p_table_name AND column_name = 'email_hashes'
  ) INTO v_has_hashes_column;
  
  -- If email_hashes column doesn't exist, just return (table using old schema)
  IF NOT v_has_hashes_column THEN
    RAISE NOTICE 'Table % does not have email_hashes column, skipping', p_table_name;
    RETURN;
  END IF;
  
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
DECLARE
  v_has_hashes_column BOOLEAN;
BEGIN
  -- Check if email_hashes column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'web_visitor' AND column_name = 'email_hashes'
  ) INTO v_has_hashes_column;
  
  IF v_has_hashes_column THEN
    -- Use new JSONB column
    RETURN QUERY
    SELECT wv.visitor_id, wv.is_identified, wv.lead_id
    FROM web_visitor wv
    WHERE 
      (p_sha256 IS NOT NULL AND wv.email_hashes->'sha256' @> to_jsonb(p_sha256)) OR
      (p_sha1 IS NOT NULL AND wv.email_hashes->'sha1' @> to_jsonb(p_sha1)) OR
      (p_md5 IS NOT NULL AND wv.email_hashes->'md5' @> to_jsonb(p_md5))
    LIMIT 1;
  ELSE
    -- Fallback to old email_hash column
    RETURN QUERY
    SELECT wv.visitor_id, wv.is_identified, wv.lead_id
    FROM web_visitor wv
    WHERE p_sha256 IS NOT NULL AND wv.email_hash = p_sha256
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to find lead by ANY email hash
CREATE OR REPLACE FUNCTION find_lead_by_email_hash(
  p_sha256 TEXT DEFAULT NULL,
  p_sha1 TEXT DEFAULT NULL,
  p_md5 TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, work_email TEXT, first_name TEXT, last_name TEXT) AS $$
DECLARE
  v_has_hashes_column BOOLEAN;
BEGIN
  -- Check if email_hashes column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lead' AND column_name = 'email_hashes'
  ) INTO v_has_hashes_column;
  
  IF v_has_hashes_column THEN
    -- Use new JSONB column
    RETURN QUERY
    SELECT l.id, l.work_email, l.first_name, l.last_name
    FROM lead l
    WHERE 
      (p_sha256 IS NOT NULL AND l.email_hashes->'sha256' @> to_jsonb(p_sha256)) OR
      (p_sha1 IS NOT NULL AND l.email_hashes->'sha1' @> to_jsonb(p_sha1)) OR
      (p_md5 IS NOT NULL AND l.email_hashes->'md5' @> to_jsonb(p_md5))
    LIMIT 1;
  ELSE
    -- No email_hashes column, just search by email
    RETURN QUERY
    SELECT l.id, l.work_email, l.first_name, l.last_name
    FROM lead l
    WHERE l.work_email IS NOT NULL OR l.personal_email IS NOT NULL
    LIMIT 0; -- Return empty if no hashes available
  END IF;
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
  v_web_visitor_id UUID;
BEGIN
  -- Get the web_visitor record
  SELECT id INTO v_web_visitor_id
  FROM web_visitor
  WHERE visitor_id = p_visitor_id
  LIMIT 1;
  
  IF v_web_visitor_id IS NULL THEN
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
  
  -- Update web_visitor record
  UPDATE web_visitor
  SET 
    is_identified = TRUE,
    identified_at = NOW(),
    lead_id = v_lead_id,
    updated_at = NOW()
  WHERE id = v_web_visitor_id;
  
  -- Reassign all sessions from web_visitor to lead
  UPDATE session
  SET 
    lead_id = v_lead_id,
    web_visitor_id = NULL,
    updated_at = NOW()
  WHERE web_visitor_id = v_web_visitor_id;
  
  -- Reassign all events from web_visitor to lead
  UPDATE event
  SET 
    lead_id = v_lead_id,
    web_visitor_id = NULL,
    updated_at = NOW()
  WHERE web_visitor_id = v_web_visitor_id;
  
  RETURN v_lead_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create web_visitor
CREATE OR REPLACE FUNCTION get_or_create_web_visitor(
  p_visitor_id TEXT,
  p_device_fingerprint TEXT DEFAULT NULL,
  p_browser_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_web_visitor_id UUID;
BEGIN
  -- Try to find existing web_visitor
  SELECT id INTO v_web_visitor_id
  FROM web_visitor
  WHERE visitor_id = p_visitor_id
  LIMIT 1;
  
  IF v_web_visitor_id IS NULL THEN
    -- Create new web_visitor
    INSERT INTO web_visitor (
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
    RETURNING id INTO v_web_visitor_id;
  ELSE
    -- Update last seen
    UPDATE web_visitor
    SET 
      last_seen_at = NOW(),
      updated_at = NOW()
    WHERE id = v_web_visitor_id;
  END IF;
  
  RETURN v_web_visitor_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
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
  l.id as lead_id,
  l.work_email,
  l.first_name,
  l.last_name,
  l.company_name,
  l.tracking_id,
  l.identified_at,
  l.identification_method
FROM web_visitor wv
LEFT JOIN lead l ON wv.lead_id = l.id;

-- View: Anonymous visitors (not yet identified)
CREATE OR REPLACE VIEW anonymous_visitors AS
SELECT *
FROM web_visitor
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
INNER JOIN web_visitor wv ON l.id = wv.lead_id
WHERE l.identified_at >= NOW() - INTERVAL '7 days'
ORDER BY l.identified_at DESC;

-- View: High-intent anonymous visitors
CREATE OR REPLACE VIEW high_intent_anonymous AS
SELECT 
  wv.*,
  (SELECT COUNT(*) FROM session WHERE web_visitor_id = wv.id) as session_count,
  (SELECT MAX(created_at) FROM event WHERE web_visitor_id = wv.id) as last_event_at
FROM web_visitor wv
WHERE 
  wv.is_identified = FALSE
  AND wv.intent_score >= 50
  AND wv.last_seen_at >= NOW() - INTERVAL '7 days'
ORDER BY wv.intent_score DESC, wv.last_seen_at DESC;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to web_visitor
DROP TRIGGER IF EXISTS update_web_visitor_updated_at ON web_visitor;
CREATE TRIGGER update_web_visitor_updated_at 
BEFORE UPDATE ON web_visitor 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMPLETE!
-- ============================================

SELECT 'web_visitor architecture added successfully!' as status;
