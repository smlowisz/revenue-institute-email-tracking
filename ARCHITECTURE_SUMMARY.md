# New Architecture: web_visitor + lead Separation

## Overview

The database now has a **clear separation** between anonymous and identified visitors:

1. **`web_visitor`** table = Anonymous visitors (no email/contact info yet)
2. **`lead`** table = Identified people (have email or contact info)
3. **`event`** and **`session`** tables = Link to **EITHER** `web_visitor_id` **OR** `lead_id` (never both)

## Key Files Created

### 1. Schema & Migration
- **`supabase/schema-web-visitor.sql`** - Complete schema with all tables, indexes, functions, and views
- **`supabase/migration-to-web-visitor.sql`** - Migration script to transition from old to new structure

### 2. Worker Code
- **`src/worker/supabase-web-visitor.ts`** - Supabase client with functions for web_visitor operations
- **`src/worker/index-web-visitor.ts`** - Updated worker that routes events to correct table

### 3. Documentation
- **`supabase/EVENT_TRACKING_ARCHITECTURE.md`** - How events track to web_visitor vs lead
- **`supabase/EMAIL_HASH_STORAGE.md`** - How multiple email hashes are stored for de-anonymization
- **`ARCHITECTURE_SUMMARY.md`** - This file

## How It Works

### Phase 1: Anonymous Visitor

```
1. Person visits website
   ↓
2. Browser generates visitor_id (e.g., 'v123')
   ↓
3. Creates record in web_visitor table
   - visitor_id: 'v123'
   - is_identified: FALSE
   - email_hashes: NULL
   ↓
4. Events/sessions point to web_visitor_id
```

**Database State:**
```sql
-- web_visitor table
| id      | visitor_id | is_identified | email_hashes | lead_id |
|---------|------------|---------------|--------------|---------|
| abc-123 | v123       | FALSE         | NULL         | NULL    |

-- event table
| id      | web_visitor_id | lead_id | type      |
|---------|----------------|---------|-----------|
| e1      | abc-123        | NULL    | page_view |
| e2      | abc-123        | NULL    | click     |
```

### Phase 2: Email Detected (Not Yet Identified)

```
1. Browser scan finds email in localStorage
   ↓
2. Hash email in ALL formats (SHA-256, SHA-1, MD5)
   ↓
3. Store in web_visitor.email_hashes
   {
     "sha256": ["hash1"],
     "sha1": ["hash2"],
     "md5": ["hash3"]
   }
   ↓
4. Still anonymous, but now matchable
```

**Database State:**
```sql
-- web_visitor table (updated)
| id      | visitor_id | is_identified | email_hashes                    | lead_id |
|---------|------------|---------------|---------------------------------|---------|
| abc-123 | v123       | FALSE         | {"sha256": [...], "sha1": ...}  | NULL    |
```

### Phase 3: Identification

```
1. Person submits form with email
   OR
   Clicks email link with tracking_id
   ↓
2. Call identify_visitor() function
   ↓
3. Creates lead record
   ↓
4. Updates web_visitor:
   - is_identified = TRUE
   - lead_id = xyz-789
   ↓
5. Moves ALL past events/sessions to lead_id
```

**Database State:**
```sql
-- web_visitor table (after identification)
| id      | visitor_id | is_identified | lead_id |
|---------|------------|---------------|---------|
| abc-123 | v123       | TRUE          | xyz-789 |

-- lead table (created)
| id      | email           | tracking_id | original_visitor_id |
|---------|-----------------|-------------|---------------------|
| xyz-789 | john@company.com| t123        | v123                |

-- event table (updated - moved to lead)
| id      | web_visitor_id | lead_id | type      |
|---------|----------------|---------|-----------|
| e1      | NULL           | xyz-789 | page_view |
| e2      | NULL           | xyz-789 | click     |
```

### Phase 4: Future Events

```
All future events go straight to lead_id since they're now identified
```

**Database State:**
```sql
-- New events after identification
| id      | web_visitor_id | lead_id | type      |
|---------|----------------|---------|-----------|
| e3      | NULL           | xyz-789 | page_view |
| e4      | NULL           | xyz-789 | form_submit |
```

## Key Tables

### web_visitor

```sql
CREATE TABLE web_visitor (
  id UUID PRIMARY KEY,
  visitor_id TEXT UNIQUE NOT NULL,        -- Browser-generated ID
  
  -- Email hashes for de-anonymization
  email_hashes JSONB,                      -- {sha256: [...], sha1: [...], md5: [...]}
  email_domains TEXT[],                    -- ['company.com', 'gmail.com']
  
  -- Behavioral metrics
  total_sessions INTEGER,
  total_pageviews INTEGER,
  intent_score FLOAT,
  
  -- Identification
  is_identified BOOLEAN DEFAULT FALSE,
  identified_at TIMESTAMPTZ,
  lead_id UUID                             -- Links to lead table after identification
);
```

### lead

```sql
CREATE TABLE lead (
  id UUID PRIMARY KEY,
  work_email TEXT,
  personal_email TEXT,
  first_name TEXT,
  last_name TEXT,
  
  -- Email hashes for matching
  email_hashes JSONB,                      -- {sha256: [...], sha1: [...], md5: [...]}
  
  -- Tracking
  tracking_id TEXT UNIQUE,                 -- For email campaigns (e.g., 't123')
  original_visitor_id TEXT,                -- The visitor_id before identification
  
  -- Identification metadata
  identified_at TIMESTAMPTZ,
  identification_method TEXT               -- 'email_capture', 'form_submit', 'utm_param'
);
```

### event

```sql
CREATE TABLE event (
  id UUID PRIMARY KEY,
  type event_type NOT NULL,
  category event_category NOT NULL,
  
  -- Ownership: EITHER web_visitor_id OR lead_id (NOT BOTH)
  web_visitor_id UUID,
  lead_id UUID,
  
  session_id UUID NOT NULL,
  url TEXT,
  data JSON,
  
  -- CHECK constraint ensures only one owner
  CONSTRAINT check_event_owner CHECK (
    (web_visitor_id IS NOT NULL AND lead_id IS NULL) OR
    (web_visitor_id IS NULL AND lead_id IS NOT NULL)
  )
);
```

### session

```sql
CREATE TABLE session (
  id UUID PRIMARY KEY,
  
  -- Ownership: EITHER web_visitor_id OR lead_id (NOT BOTH)
  web_visitor_id UUID,
  lead_id UUID,
  
  start_time TIMESTAMPTZ NOT NULL,
  pageviews INTEGER,
  clicks INTEGER,
  
  -- CHECK constraint ensures only one owner
  CONSTRAINT check_session_owner CHECK (
    (web_visitor_id IS NOT NULL AND lead_id IS NULL) OR
    (web_visitor_id IS NULL AND lead_id IS NOT NULL)
  )
);
```

## Key Functions

### 1. getOrCreateWebVisitor()

```typescript
const webVisitorId = await supabase.getOrCreateWebVisitor(
  'v123',           // visitor_id from browser
  'device-fp-456',  // device fingerprint
  'browser-id-789'  // browser ID
);
```

### 2. identifyVisitor()

```typescript
const leadId = await supabase.identifyVisitor(
  'v123',                    // visitor_id
  'john@company.com',        // email
  'John',                    // first name
  'Doe',                     // last name
  'form_submit'              // identification method
);
```

This function automatically:
- Creates lead record
- Updates web_visitor (is_identified = TRUE)
- Moves ALL past events to lead_id
- Moves ALL past sessions to lead_id

### 3. add_email_hashes()

```sql
SELECT add_email_hashes(
  'web_visitor',             -- table name
  'abc-123',                 -- record id
  'sha256_hash',             -- SHA-256 hash
  'sha1_hash',               -- SHA-1 hash
  'md5_hash',                -- MD5 hash
  'company.com'              -- email domain
);
```

Stores multiple email hashes for better de-anonymization matching.

### 4. find_visitor_by_email_hash()

```sql
SELECT * FROM find_visitor_by_email_hash(
  p_sha256 := 'sha256_hash',
  p_sha1 := 'sha1_hash',
  p_md5 := 'md5_hash'
);
```

Finds visitor by ANY hash format.

## Query Patterns

### Get all events for anonymous visitor

```sql
SELECT * FROM event
WHERE web_visitor_id = 'abc-123';
```

### Get all events for identified lead

```sql
SELECT * FROM event
WHERE lead_id = 'xyz-789';
```

### Get complete history (anonymous + identified)

```sql
-- Get web_visitor record
SELECT lead_id FROM web_visitor WHERE visitor_id = 'v123';

-- Get all events (already moved to lead during identification)
SELECT * FROM event
WHERE lead_id = 'xyz-789'
ORDER BY created_at;
```

### View all visitors (anonymous + identified)

```sql
SELECT * FROM all_visitors;
-- This view joins web_visitor + lead tables
```

### Find high-intent anonymous visitors

```sql
SELECT * FROM high_intent_anonymous
WHERE intent_score >= 70
ORDER BY intent_score DESC;
```

## Migration Steps

### 1. Run Schema

```sql
\i supabase/schema-web-visitor.sql
```

Creates all tables, indexes, functions, and views.

### 2. Run Migration (If You Have Existing Data)

```sql
\i supabase/migration-to-web-visitor.sql
```

Migrates existing lead records:
- Anonymous leads → web_visitor table
- Identified leads → stay in lead table
- Updates all events/sessions references

### 3. Update Worker Code

Replace your current worker with the new one:

```bash
# In wrangler.toml, update the main entry point
main = "src/worker/index-web-visitor.ts"
```

### 4. Deploy

```bash
npx wrangler deploy
```

## Benefits

1. **Clear Separation**: Anonymous visitors are clearly separate from identified leads
2. **Better Tracking**: Can track anonymous behavior before identification
3. **De-Anonymization**: Store email hashes for matching across sessions
4. **Complete History**: When identified, ALL past events are preserved
5. **Better Queries**: Easy to query anonymous vs identified separately
6. **Scalability**: Better performance with separate tables and proper indexes

## Important Notes

1. **Mutually Exclusive**: Events belong to EITHER web_visitor OR lead, never both
2. **Automatic Migration**: `identify_visitor()` function moves everything automatically
3. **Multiple Hashes**: Store SHA-256, SHA-1, and MD5 for best matching
4. **Preserve History**: All anonymous behavior is preserved after identification
5. **GIN Indexes**: JSONB fields use GIN indexes for fast hash lookups

## Example Flow

```typescript
// 1. Anonymous visitor arrives
const webVisitorId = await getOrCreateWebVisitor('v123');

// 2. Create session for anonymous visitor
const sessionId = await getOrCreateSession(
  'session-string',
  webVisitorId,  // web_visitor_id
  null           // lead_id
);

// 3. Store events
await insertEvents([{
  type: 'page_view',
  web_visitor_id: webVisitorId,
  lead_id: null,
  session_id: sessionId
}]);

// 4. Later: Email detected, store hashes
await updateWebVisitorEmailHashes(
  webVisitorId,
  'sha256_hash',
  'sha1_hash',
  'md5_hash',
  'company.com'
);

// 5. Later: Person submits form with email
const leadId = await identifyVisitor(
  'v123',
  'john@company.com',
  'John',
  'Doe',
  'form_submit'
);
// ALL past events now point to leadId!

// 6. Future events go straight to lead
await insertEvents([{
  type: 'page_view',
  web_visitor_id: null,
  lead_id: leadId,
  session_id: newSessionId
}]);
```

## Files to Use

### For Production
1. `supabase/schema-web-visitor.sql` - Run this first
2. `supabase/migration-to-web-visitor.sql` - Run if you have existing data
3. `src/worker/index-web-visitor.ts` - Deploy this worker
4. `src/worker/supabase-web-visitor.ts` - Client used by worker

### For Reference
1. `supabase/EVENT_TRACKING_ARCHITECTURE.md` - Detailed event tracking explanation
2. `supabase/EMAIL_HASH_STORAGE.md` - Email hash storage details
3. `ARCHITECTURE_SUMMARY.md` - This file

## Next Steps

1. ✅ Review the schema in `schema-web-visitor.sql`
2. ✅ Test in staging environment first
3. ✅ Run migration script if you have existing data
4. ✅ Update and deploy worker code
5. ✅ Verify events are being stored correctly
6. ✅ Test identification flow
7. ✅ Check that past events move correctly on identification
