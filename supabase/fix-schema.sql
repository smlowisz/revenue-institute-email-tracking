-- ============================================
-- FIX EVENT TABLE SCHEMA
-- ============================================
-- The event table is missing deviceType column
-- Add it to match what the worker is sending
-- ============================================

-- Check current schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'event' 
ORDER BY ordinal_position;

-- Add missing deviceType column (should be device_type to match snake_case convention)
-- But your schema shows it as camelCase, so we'll match that
ALTER TABLE event ADD COLUMN IF NOT EXISTS "deviceType" TEXT;

-- Verify it was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'event' AND column_name = 'deviceType';

-- ============================================
-- DONE
-- ============================================

