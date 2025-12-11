# Email Hash Storage Architecture

## Why Store Multiple Hash Formats?

Different systems use different hash algorithms. By storing **ALL** hash formats (SHA-256, SHA-1, MD5), we maximize our chances of matching and de-anonymizing visitors.

## Data Structure

### JSONB Format in Database

```json
{
  "sha256": [
    "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
  ],
  "sha1": [
    "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8",
    "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
  ],
  "md5": [
    "5f4dcc3b5aa765d61d8327deb882cf99",
    "c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  ]
}
```

### Why Arrays in Each Hash Type?

A person might have **multiple emails**:
- Work email: `john@company.com`
- Personal email: `john@gmail.com`
- Old email: `john@oldcompany.com`

Each email has its own set of hashes, so we store arrays of hashes for each format.

## Schema

### web_visitor Table

```sql
CREATE TABLE web_visitor (
  id UUID PRIMARY KEY,
  visitor_id TEXT UNIQUE NOT NULL,
  
  -- Store ALL email hashes for matching
  email_hashes JSONB, -- {sha256: [...], sha1: [...], md5: [...]}
  email_domains TEXT[], -- ['company.com', 'gmail.com']
  
  -- ... other fields
);

-- GIN index for fast JSONB queries
CREATE INDEX idx_web_visitor_email_hashes 
ON web_visitor USING GIN(email_hashes) 
WHERE email_hashes IS NOT NULL;

-- GIN index for domain matching
CREATE INDEX idx_web_visitor_email_domains 
ON web_visitor USING GIN(email_domains) 
WHERE email_domains IS NOT NULL;
```

### lead Table

```sql
CREATE TABLE lead (
  id UUID PRIMARY KEY,
  work_email TEXT,
  personal_email TEXT,
  
  -- Store ALL email hashes for matching
  email_hashes JSONB, -- {sha256: [...], sha1: [...], md5: [...]}
  
  -- ... other fields
);

-- GIN index for fast JSONB queries
CREATE INDEX idx_lead_email_hashes 
ON lead USING GIN(email_hashes) 
WHERE email_hashes IS NOT NULL;
```

## Usage Examples

### 1. Adding Email Hashes (from browser scan)

```sql
-- Add hashes to web_visitor
SELECT add_email_hashes(
  'web_visitor',                           -- table name
  'abc-123-visitor-id',                    -- record id
  '5e884898da28047151d0e56f8dc6292...',   -- sha256
  '5baa61e4c9b93f3f0682250b6cf8331...',   -- sha1
  '5f4dcc3b5aa765d61d8327deb882cf99',     -- md5
  'company.com'                             -- email domain
);

-- Add hashes to lead
SELECT add_email_hashes(
  'lead',
  'xyz-789-lead-id',
  '5e884898da28047151d0e56f8dc6292...',
  '5baa61e4c9b93f3f0682250b6cf8331...',
  '5f4dcc3b5aa765d61d8327deb882cf99'
);
```

### 2. Finding Visitor by ANY Hash

```sql
-- Try SHA-256 first
SELECT * FROM find_visitor_by_email_hash(
  p_sha256 := '5e884898da28047151d0e56f8dc6292...'
);

-- Try SHA-1 if SHA-256 not found
SELECT * FROM find_visitor_by_email_hash(
  p_sha1 := '5baa61e4c9b93f3f0682250b6cf8331...'
);

-- Try MD5 if others not found
SELECT * FROM find_visitor_by_email_hash(
  p_md5 := '5f4dcc3b5aa765d61d8327deb882cf99'
);

-- Try ALL at once (most efficient)
SELECT * FROM find_visitor_by_email_hash(
  p_sha256 := '5e884898da28047151d0e56f8dc6292...',
  p_sha1 := '5baa61e4c9b93f3f0682250b6cf8331...',
  p_md5 := '5f4dcc3b5aa765d61d8327deb882cf99'
);
```

### 3. Finding Lead by ANY Hash

```sql
SELECT * FROM find_lead_by_email_hash(
  p_sha256 := '5e884898da28047151d0e56f8dc6292...',
  p_sha1 := '5baa61e4c9b93f3f0682250b6cf8331...',
  p_md5 := '5f4dcc3b5aa765d61d8327deb882cf99'
);
```

### 4. Manual JSONB Queries

```sql
-- Check if SHA-256 hash exists
SELECT * FROM web_visitor
WHERE email_hashes->'sha256' @> '"5e884898da28047151d0e56f8dc6292..."'::jsonb;

-- Check if SHA-1 hash exists
SELECT * FROM web_visitor
WHERE email_hashes->'sha1' @> '"5baa61e4c9b93f3f0682250b6cf8331..."'::jsonb;

-- Check if MD5 hash exists
SELECT * FROM web_visitor
WHERE email_hashes->'md5' @> '"5f4dcc3b5aa765d61d8327deb882cf99"'::jsonb;

-- Check if ANY hash type contains a value
SELECT * FROM web_visitor
WHERE 
  email_hashes->'sha256' @> '"5e884898da28047151d0e56f8dc6292..."'::jsonb OR
  email_hashes->'sha1' @> '"5baa61e4c9b93f3f0682250b6cf8331..."'::jsonb OR
  email_hashes->'md5' @> '"5f4dcc3b5aa765d61d8327deb882cf99"'::jsonb;
```

### 5. Get All Hashes for a Visitor

```sql
SELECT 
  visitor_id,
  email_hashes->'sha256' as sha256_hashes,
  email_hashes->'sha1' as sha1_hashes,
  email_hashes->'md5' as md5_hashes,
  email_domains
FROM web_visitor
WHERE visitor_id = 'v1';
```

### 6. Count Unique Emails per Visitor

```sql
SELECT 
  visitor_id,
  jsonb_array_length(email_hashes->'sha256') as num_emails_sha256,
  array_length(email_domains, 1) as num_domains
FROM web_visitor
WHERE email_hashes IS NOT NULL;
```

## Worker Code Pattern

```typescript
// From browser_emails_scanned event
const emailsFound = event.data.emails; // [{ email, hash, sources }]

for (const emailData of emailsFound) {
  const { email, hash, sources } = emailData;
  
  // Hash the email in all formats
  const hashes = {
    sha256: hash, // Already provided by client
    sha1: await hashEmailSHA1(email),
    md5: await hashEmailMD5(email)
  };
  
  const domain = email.split('@')[1];
  
  // Try to find existing visitor by ANY hash
  const existingVisitor = await supabase.request(
    'GET',
    `/rpc/find_visitor_by_email_hash`,
    {
      p_sha256: hashes.sha256,
      p_sha1: hashes.sha1,
      p_md5: hashes.md5
    }
  );
  
  if (existingVisitor) {
    // Match found! Add these hashes to existing record
    await supabase.request(
      'POST',
      '/rpc/add_email_hashes',
      {
        p_table_name: 'web_visitor',
        p_record_id: existingVisitor.id,
        p_sha256: hashes.sha256,
        p_sha1: hashes.sha1,
        p_md5: hashes.md5,
        p_email_domain: domain
      }
    );
  } else {
    // New visitor - create with hashes
    await supabase.request(
      'POST',
      '/web_visitor',
      {
        visitor_id: currentVisitorId,
        email_hashes: {
          sha256: [hashes.sha256],
          sha1: [hashes.sha1],
          md5: [hashes.md5]
        },
        email_domains: [domain]
      }
    );
  }
}
```

## De-Anonymization Flow

```
1. Browser scan finds email: john@company.com
   ↓
2. Generate ALL hashes:
   - SHA-256: 5e884898...
   - SHA-1: 5baa61e4...
   - MD5: 5f4dcc3b...
   ↓
3. Check if ANY hash matches existing records:
   - Check web_visitor.email_hashes
   - Check lead.email_hashes
   ↓
4a. MATCH FOUND → Link visitor to existing lead
4b. NO MATCH → Store hashes for future matching
```

## Benefits

1. **Better Matching**: Different systems use different hash algorithms
2. **Multiple Emails**: Track all emails associated with a person
3. **Historical Data**: Match against emails they used in the past
4. **Third-party Integrations**: Match against email lists from other systems
5. **Privacy**: Never store plain-text emails unless explicitly provided

## Query Performance

The GIN indexes make JSONB queries very fast:

```sql
-- Fast containment check (uses GIN index)
WHERE email_hashes->'sha256' @> '"hash_value"'::jsonb

-- Fast "any of" check (uses GIN index)
WHERE 
  email_hashes->'sha256' @> '"hash1"'::jsonb OR
  email_hashes->'sha1' @> '"hash2"'::jsonb OR
  email_hashes->'md5' @> '"hash3"'::jsonb
```

## Example Data

```sql
-- web_visitor record
{
  "id": "abc-123",
  "visitor_id": "v1",
  "email_hashes": {
    "sha256": [
      "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
    ],
    "sha1": [
      "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8",
      "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
    ],
    "md5": [
      "5f4dcc3b5aa765d61d8327deb882cf99",
      "c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
    ]
  },
  "email_domains": ["company.com", "gmail.com"]
}
```

This represents a visitor with 2 detected emails:
- One from `company.com`
- One from `gmail.com`

Each email has been hashed in all 3 formats for maximum matching potential.
