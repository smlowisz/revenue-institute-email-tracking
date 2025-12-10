-- ============================================
-- SUPABASE INDEXES FOR PERFORMANCE (SIMPLIFIED)
-- ============================================
-- Skips JSONB indexes since data column is JSON type
-- ============================================

-- Lead table indexes
CREATE INDEX IF NOT EXISTS idx_lead_tracking_id ON lead(tracking_id);
CREATE INDEX IF NOT EXISTS idx_lead_work_email ON lead(work_email);
CREATE INDEX IF NOT EXISTS idx_lead_personal_email ON lead(personal_email);
CREATE INDEX IF NOT EXISTS idx_lead_updated_at ON lead(updated_at DESC);

-- Event table indexes
CREATE INDEX IF NOT EXISTS idx_event_lead_id ON event(lead_id);
CREATE INDEX IF NOT EXISTS idx_event_session_id ON event(session_id);
CREATE INDEX IF NOT EXISTS idx_event_type ON event(type);
CREATE INDEX IF NOT EXISTS idx_event_category ON event(category);
CREATE INDEX IF NOT EXISTS idx_event_created_at ON event(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_lead_created ON event(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_session_created ON event(session_id, created_at DESC);

-- Session table indexes
CREATE INDEX IF NOT EXISTS idx_session_lead_id ON session(lead_id);
CREATE INDEX IF NOT EXISTS idx_session_start_time ON session(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_session_lead_start ON session(lead_id, start_time DESC);

-- Campaign tables indexes
CREATE INDEX IF NOT EXISTS idx_campaign_member_lead_id ON campaign_member(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_member_campaign_id ON campaign_member(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_member_status ON campaign_member(member_status);

-- Session identity map indexes
CREATE INDEX IF NOT EXISTS idx_session_id_map_session ON session_id_map(session_id);
CREATE INDEX IF NOT EXISTS idx_session_id_map_identified ON session_id_map(identified_visitor_id);
CREATE INDEX IF NOT EXISTS idx_session_id_map_email_hash ON session_id_map(email_hash);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_lead_type_created ON event(lead_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_lead_time_range ON session(lead_id, start_time, end_time);

-- ✅ All indexes created (19 total)

