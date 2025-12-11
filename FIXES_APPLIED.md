# Fixes Applied - web_visitor Architecture

**Date:** December 10, 2025

---

## ✅ All Critical Fixes Completed

### 1. ✅ Pixel Email Hashing - Send All 3 Hash Types

**File:** `src/pixel/index.ts`

**Changed:**
- Added MD5 implementation (pure JavaScript, browser-compatible)
- Updated `hashEmail()` to return all 3 hashes: SHA-256, SHA-1, MD5
- Updated `browser_emails_scanned` event to send all hashes:

```typescript
// OLD:
emailHashes.push({
  email,
  hash: hashes.sha256,  // Only SHA-256
  sources
});

// NEW:
emailHashes.push({
  email,
  sha256: hashes.sha256,  // ✅ SHA-256
  sha1: hashes.sha1,      // ✅ SHA-1
  md5: hashes.md5,        // ✅ MD5
  sources
});
```

### 2. ✅ Device Fingerprint - Sent in page_view Event

**File:** `src/pixel/index.ts`

**Changed:**
- Device fingerprint already generated (line 297)
- Already included in page_view event data (line 329)
- Worker extracts it: `firstEvent.data?.deviceFingerprint`

**Verified:** ✅ Working correctly

### 3. ✅ Browser ID - Sent in page_view Event

**File:** `src/pixel/index.ts`

**Changed:**
- Browser ID extracted early (line 298)
- Already included in page_view event data (line 330)
- Worker extracts it: `firstEvent.data?.browserId`

**Verified:** ✅ Working correctly

### 4. ✅ wrangler.toml - Points to New Worker

**File:** `wrangler.toml`

**Changed:**
```toml
# OLD:
main = "src/worker/index.ts"

# NEW:
main = "src/worker/index-web-visitor.ts"
```

### 5. ✅ Worker Personalization - Handles web_visitor

**File:** `src/worker/index-web-visitor.ts`

**Added 3 new functions:**

1. **`lookupWebVisitorInSupabase()`** - Finds web_visitor by visitor_id
2. **`lookupLeadById()`** - Finds lead by UUID
3. **Updated `handlePersonalization()`** - Checks web_visitor table

**New Flow:**
```typescript
1. Check KV cache (IDENTITY_STORE)
2. Check KV cache (PERSONALIZATION)
3. Try to find lead by tracking_id
4. Try to find web_visitor by visitor_id
   - If identified → fetch lead data
   - If anonymous → return { personalized: false }
5. Return personalization data
```

### 6. ✅ Worker Email Hash Extraction

**File:** `src/worker/index-web-visitor.ts`

**Changed:**
```typescript
// OLD: Only extracted SHA-256
emailHash = firstEmail.hash || null;

// NEW: Extract all 3 hash types
emailHashes = {
  sha256: firstEmail.sha256 || firstEmail.hash || null,
  sha1: firstEmail.sha1 || null,
  md5: firstEmail.md5 || null
};
```

**Then stores all hashes:**
```typescript
await supabase.updateWebVisitorEmailHashes(
  webVisitorId,
  emailHashes.sha256 || '',
  emailHashes.sha1 || null,
  emailHashes.md5 || null,
  emailDomain
);
```

---

## 📦 Files Modified

1. ✅ `src/pixel/index.ts` - MD5 implementation, hash sending, device/browser IDs
2. ✅ `wrangler.toml` - Worker entry point
3. ✅ `src/worker/index-web-visitor.ts` - Personalization, hash extraction
4. ✅ `src/worker/supabase-web-visitor.ts` - Already correct
5. ✅ `dist/pixel.iife.js` - Rebuilt with new code

---

## 🚀 Ready to Deploy

### Pre-Deployment Checklist

- [x] Pixel code updated with MD5 hashing
- [x] Pixel sends device fingerprint
- [x] Pixel sends browser ID
- [x] Pixel sends all 3 hash types (SHA-256, SHA-1, MD5)
- [x] Worker entry point updated in wrangler.toml
- [x] Worker handles personalization for web_visitor
- [x] Worker extracts all email hashes
- [x] Pixel bundle rebuilt
- [ ] Deploy to Cloudflare
- [ ] Test end-to-end

### Deploy Command

```bash
npx wrangler deploy
```

---

## 🧪 Testing Plan

### Test 1: Anonymous Visitor

```bash
# Visit site without tracking_id
# Expected database state:
```

```sql
-- Should create web_visitor record
SELECT * FROM web_visitor 
WHERE visitor_id = '{browser-generated-id}'
AND is_identified = FALSE;

-- Events should point to web_visitor_id
SELECT * FROM event 
WHERE web_visitor_id = '{uuid}'
AND lead_id IS NULL;
```

### Test 2: Email Detection

```bash
# Browser scan finds email
# Expected database state:
```

```sql
-- Should store email hashes
SELECT 
  visitor_id,
  email_hashes->'sha256' as sha256_hashes,
  email_hashes->'sha1' as sha1_hashes,
  email_hashes->'md5' as md5_hashes,
  email_domains
FROM web_visitor
WHERE visitor_id = '{visitor-id}';
```

### Test 3: Form Submit → Identification

```bash
# Submit form with email
# Expected database state:
```

```sql
-- Should create lead and update web_visitor
SELECT 
  wv.visitor_id,
  wv.is_identified,
  wv.identified_at,
  wv.lead_id,
  l.work_email,
  l.identification_method
FROM web_visitor wv
INNER JOIN lead l ON wv.lead_id = l.id
WHERE wv.visitor_id = '{visitor-id}';

-- ALL events should be moved to lead_id
SELECT COUNT(*) as events_on_web_visitor
FROM event
WHERE web_visitor_id IN (
  SELECT id FROM web_visitor WHERE visitor_id = '{visitor-id}'
);
-- Expected: 0

SELECT COUNT(*) as events_on_lead
FROM event
WHERE lead_id = (
  SELECT lead_id FROM web_visitor WHERE visitor_id = '{visitor-id}'
);
-- Expected: > 0 (all past events)
```

### Test 4: Email Click (Tracking ID)

```bash
# Click email link with ?i={tracking_id}
# Expected database state:
```

```sql
-- Should find existing lead
SELECT * FROM lead 
WHERE tracking_id = '{tracking-id}';

-- New events should go to lead_id
SELECT * FROM event
WHERE lead_id = '{lead-uuid}'
AND web_visitor_id IS NULL
ORDER BY created_at DESC
LIMIT 5;
```

### Test 5: Personalization

```bash
# Call /personalize?vid={tracking-id}
# Expected response:
```

```json
{
  "personalized": true,
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@company.com",
  "company": "Company Name",
  "intentScore": 0,
  "engagementLevel": "new"
}
```

---

## 🔍 Post-Deployment Validation

### Query 1: Check Event Ownership

```sql
SELECT 
  CASE 
    WHEN web_visitor_id IS NOT NULL THEN 'web_visitor'
    WHEN lead_id IS NOT NULL THEN 'lead'
    ELSE 'ORPHANED'
  END as owner_type,
  COUNT(*) as count
FROM event
GROUP BY owner_type;

-- Expected:
-- web_visitor: X (anonymous events)
-- lead: Y (identified events)
-- ORPHANED: 0 (should be ZERO!)
```

### Query 2: Check Identification Rate

```sql
SELECT 
  COUNT(*) FILTER (WHERE is_identified = FALSE) as anonymous,
  COUNT(*) FILTER (WHERE is_identified = TRUE) as identified,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_identified = TRUE) / COUNT(*), 2) as identification_rate
FROM web_visitor;
```

### Query 3: Check Email Hashes

```sql
SELECT 
  COUNT(*) as total_visitors,
  COUNT(*) FILTER (WHERE email_hashes IS NOT NULL) as has_hashes,
  COUNT(*) FILTER (WHERE email_hashes->'sha256' != '[]'::jsonb) as has_sha256,
  COUNT(*) FILTER (WHERE email_hashes->'sha1' != '[]'::jsonb) as has_sha1,
  COUNT(*) FILTER (WHERE email_hashes->'md5' != '[]'::jsonb) as has_md5
FROM web_visitor;
```

---

## 📊 Monitoring

### Cloudflare Logs

Watch for these log messages:
```
✅ "Tracking as anonymous visitor: {vid} → web_visitor {uuid}"
✅ "Visitor identified via tracking_id: {tid} → lead {uuid}"
✅ "Visitor newly identified: {vid} → lead {uuid}"
✅ "Updated web_visitor {uuid} with email hashes"
```

### Error Patterns to Watch

```
❌ "Failed to create web_visitor"
❌ "Failed to identify visitor"
❌ "Event must have exactly one of web_visitor_id or lead_id"
❌ "Session must have exactly one of webVisitorId or leadId"
```

---

## 🎯 Success Metrics

After 24 hours of deployment:

- [ ] No orphaned events (web_visitor_id IS NULL AND lead_id IS NULL)
- [ ] No events with both IDs set
- [ ] Identification flow working (web_visitor → lead)
- [ ] Email hashes being populated (all 3 types)
- [ ] Device fingerprints being stored
- [ ] Personalization working for identified leads
- [ ] No worker errors in Cloudflare dashboard

---

## 🚨 Rollback Plan

If issues arise:

1. **Quick rollback:**
   ```bash
   # Revert wrangler.toml
   git checkout wrangler.toml
   npx wrangler deploy
   ```

2. **Database is safe:**
   - New columns are optional (nullable)
   - Old code will continue to work with lead_id
   - web_visitor_id will just stay NULL

3. **No data loss:**
   - All data preserved in new columns
   - Can roll forward again after fixing

---

## 📝 Next Steps

1. ✅ All code fixes complete
2. ➡️ **Deploy:** `npx wrangler deploy`
3. ➡️ **Hard reload site:** Clear cache (Cmd+Shift+R)
4. ➡️ **Test:** Run all 5 test scenarios
5. ➡️ **Monitor:** Watch logs for 24 hours
6. ➡️ **Validate:** Run SQL queries above
7. ➡️ **Document:** Update README with new architecture

**Status:** 🟢 READY TO DEPLOY
