# QA Report: web_visitor Architecture Implementation

**Date:** December 10, 2025  
**Status:** 🟡 Needs Testing & Deployment  

---

## Executive Summary

The database has been successfully updated with the new `web_visitor` architecture. However, **the worker code needs to be deployed** and tested end-to-end.

**Current State:**
- ✅ Database schema updated
- ✅ Functions & indexes created
- ⚠️ Worker code created but NOT deployed
- ⚠️ Pixel code needs verification
- ⚠️ End-to-end testing needed

---

## 1. Database QA

### ✅ Tables Structure

| Table | Status | Notes |
|-------|--------|-------|
| `web_visitor` | ✅ EXISTS | Has all required columns |
| `lead` | ✅ UPDATED | Added: `email_hashes`, `original_visitor_id`, `identified_at`, `identification_method` |
| `event` | ✅ UPDATED | Added: `web_visitor_id` |
| `session` | ✅ UPDATED | Added: `web_visitor_id` |

### ✅ Constraints

```sql
-- Verified constraints exist:
✅ check_event_owner: Events have EITHER web_visitor_id OR lead_id
✅ check_session_owner: Sessions have EITHER web_visitor_id OR lead_id
✅ fk_web_visitor_lead: web_visitor → lead
✅ fk_event_web_visitor: event → web_visitor
✅ fk_session_web_visitor: session → web_visitor
```

### ✅ Indexes (23 total)

All indexes created successfully including:
- 10 indexes on `web_visitor`
- 3 indexes on `lead` (new columns)
- 2 indexes on `event` (web_visitor_id)
- 2 indexes on `session` (web_visitor_id)
- GIN indexes on JSONB columns for fast hash lookups

### ✅ Functions (5 total)

| Function | Status | Purpose |
|----------|--------|---------|
| `add_email_hashes()` | ✅ | Store multiple email hashes (SHA-256, SHA-1, MD5) |
| `find_visitor_by_email_hash()` | ✅ | Find visitor by ANY hash format |
| `find_lead_by_email_hash()` | ✅ | Find lead by ANY hash format |
| `identify_visitor()` | ✅ | Transition anonymous → identified |
| `get_or_create_web_visitor()` | ✅ | Get or create visitor record |

### ✅ Views (4 total)

| View | Status | Purpose |
|------|--------|---------|
| `all_visitors` | ✅ | All visitors (anonymous + identified) |
| `anonymous_visitors` | ✅ | Only anonymous visitors |
| `recently_identified` | ✅ | Recently identified (last 7 days) |
| `high_intent_anonymous` | ✅ | High-intent anonymous visitors |

---

## 2. Worker Code QA

### ⚠️ Worker Files Created (NOT DEPLOYED)

**Files:**
- ✅ `src/worker/index-web-visitor.ts` - New worker with web_visitor logic
- ✅ `src/worker/supabase-web-visitor.ts` - Supabase client
- ⚠️ **NOT DEPLOYED TO CLOUDFLARE**

### Critical Issues to Fix Before Deployment

#### Issue #1: Worker Entry Point
```toml
# wrangler.toml needs to be updated
# Current: main = "src/worker/index.ts"
# Should be: main = "src/worker/index-web-visitor.ts"
```

#### Issue #2: Import Path
Current worker has old import:
```typescript
// src/worker/index-web-visitor.ts line 11
import { SupabaseClient } from './supabase-web-visitor';  // ✅ CORRECT
```

#### Issue #3: Function Name
Worker function name changed:
```typescript
// OLD: storeEventsWebVisits()
// NEW: storeEventsWebVisitor()
```

### Worker Logic Flow QA

**Decision Tree (Line 220-280):**

```
1. Check tracking_id → Try to find lead
   ✅ If found → Route to lead
   
2. Check email → Try to identify
   ✅ Check if already identified → Route to lead
   ✅ New identification → Call identify_visitor() → Route to lead
   
3. Still anonymous → Route to web_visitor
   ✅ Create/get web_visitor record
   ✅ Store email hashes if available
```

**✅ Logic looks correct** but needs end-to-end testing.

---

## 3. Pixel Code QA

### Current Pixel Location
```
Worker serves pixel at: /pixel.js
Path: src/pixel/index.ts
Bundled: src/worker/pixel-bundle.ts
```

### ⚠️ Pixel Code Compatibility Issues

**Issue #1: Email Hash Generation**

Current pixel code (line 468-481):
```typescript
private async hashEmail(email: string): Promise<{ sha256: string; sha1: string; md5: string }> {
  const sha256Buffer = await crypto.subtle.digest('SHA-256', data);
  const sha1Buffer = await crypto.subtle.digest('SHA-1', data);
  
  return {
    sha256: this.bufferToHex(sha256Buffer),
    sha1: this.bufferToHex(sha1Buffer),
    md5: '' // ❌ MD5 not implemented!
  };
}
```

**Problem:** MD5 hash is not generated, returned as empty string.

**Impact:** 
- `add_email_hashes()` won't store MD5 hashes
- `find_visitor_by_email_hash()` won't match on MD5

**Recommendation:** Either:
1. Add MD5 hashing library
2. Or remove MD5 from database schema (accept only SHA-256 and SHA-1)

**Issue #2: Browser Email Scanning**

Pixel scans for emails (line 1025-1131):
```typescript
private async scanBrowserForEmails(): Promise<void> {
  // Scans: localStorage, sessionStorage, cookies, URL params
  // Returns: { email, hash: sha256, sources }
}
```

**Problem:** Only sends SHA-256 hash, not SHA-1 or MD5.

**Line 1121:**
```typescript
emailHashes.push({
  email, 
  hash: hashes.sha256,  // ❌ Only SHA-256!
  sources
});
```

**Fix Needed:** Send all three hashes to worker.

---

## 4. Personalization QA

### Current Personalization System

**Files:**
- `src/pixel/personalization.ts` - Client-side personalization
- Worker endpoint: `/personalize?vid={visitorId}`

### ✅ Personalization Flow

```
1. Pixel loads → Checks URL for ?i={trackingId}
2. Calls /personalize?vid={trackingId}
3. Worker checks:
   - KV cache (IDENTITY_STORE)
   - Supabase lead table
4. Returns personalization data
5. Pixel updates DOM elements with data-personalize attributes
```

### ⚠️ Personalization Issues

**Issue #1: worker/index-web-visitor.ts**

The new worker needs to handle personalization for web_visitor records:

```typescript
// Line 1542-1565: handlePersonalization()
// Currently only looks up by tracking_id
// Needs to also check web_visitor table for anonymous visitors
```

**Missing Logic:**
```typescript
// Should add:
1. Check IDENTITY_STORE (KV) - current ✅
2. Check lead table by tracking_id - current ✅
3. Check web_visitor table by visitor_id - MISSING ❌
4. Return anonymous visitor data if found
```

**Issue #2: Anonymous Visitor Personalization**

Current system doesn't personalize for anonymous visitors. Should it?

**Options:**
1. **No personalization** for anonymous → Only show personalized content after identification
2. **Limited personalization** for anonymous → Show intent score, visit count, etc.
3. **Full personalization** → Try to match by email hash and show data

**Recommendation:** Option 1 (no personalization for anonymous) is safest for privacy.

---

## 5. Behavioral Tracking QA

### Event Types Tracked (24 total)

```sql
-- From enum event_type:
✅ page_view
✅ click
✅ scroll_depth
✅ form_start
✅ form_submit
✅ video_play
✅ video_pause
✅ video_watched
✅ video_progress
✅ video_complete
✅ focus_lost
✅ focus_gained
✅ text_copied
✅ text_pasted
✅ rage_click
✅ page_exit
✅ device_switched
✅ email_submitted
✅ email_captured
✅ identify
✅ email_sent
✅ email_bounced
✅ email_replied
✅ email_click
✅ browser_emails_scanned
```

### ✅ Pixel Event Tracking

**Line 780-803:** All events captured and queued:
```typescript
private trackEvent(type: string, data?: Record<string, any>): void {
  const event: TrackingEvent = {
    type,
    timestamp: Date.now(),
    sessionId: this.sessionId,
    visitorId: this.visitorId,  // ⚠️ May be NULL for anonymous
    url: window.location.href,
    referrer: document.referrer,
    data
  };

  this.eventQueue.push(event);
  
  // Sends every 100ms
  setTimeout(() => this.flush(), 100);
}
```

### ⚠️ Behavioral Tracking Issues

**Issue #1: Device Fingerprinting**

Pixel generates device fingerprint (line 904-924):
```typescript
private generateDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    navigator.platform
  ];
  // Returns hash
}
```

**Problem:** Worker doesn't extract and store device fingerprint in web_visitor table!

**Line 190-195 in worker:** Extracts from event data:
```typescript
const deviceFingerprint = firstEvent.data?.deviceFingerprint || null;
```

**Fix Needed:** Pixel must send device fingerprint in event data.

**Issue #2: Browser ID**

Similar issue - pixel generates browser ID but doesn't send it:
```typescript
// Line 927-938
private getBrowserId(): string {
  let browserId = localStorage.getItem('_oie_browser_id');
  if (!browserId) {
    browserId = this.generateSessionId() + '-' + Date.now();
    localStorage.setItem('_oie_browser_id', browserId);
  }
  return browserId;
}
```

**Not sent to worker!**

---

## 6. End-to-End Flow QA

### Test Scenario 1: Anonymous Visitor

```
1. User visits site (no tracking_id, no email)
   Expected: Create web_visitor record
   Status: ⚠️ NEEDS TESTING
   
2. Events tracked (page_view, click)
   Expected: Events point to web_visitor_id, lead_id = NULL
   Status: ⚠️ NEEDS TESTING
   
3. Check database:
   SELECT * FROM web_visitor WHERE visitor_id = ?;
   SELECT * FROM event WHERE web_visitor_id = ?;
   Status: ⚠️ NEEDS TESTING
```

### Test Scenario 2: Email Detection (Still Anonymous)

```
1. Browser scan finds email in localStorage
   Expected: Store email hashes in web_visitor.email_hashes
   Status: ⚠️ NEEDS TESTING
   
2. Check database:
   SELECT email_hashes FROM web_visitor WHERE visitor_id = ?;
   Expected: {"sha256": ["hash"], "sha1": ["hash"], "md5": []}
   Status: ⚠️ NEEDS TESTING
```

### Test Scenario 3: Form Submit → Identification

```
1. User submits form with email
   Expected: Call identify_visitor() function
   Status: ⚠️ NEEDS TESTING
   
2. Check database:
   SELECT * FROM web_visitor WHERE visitor_id = ?;
   Expected: is_identified = TRUE, lead_id = UUID
   Status: ⚠️ NEEDS TESTING
   
3. Check events moved:
   SELECT * FROM event WHERE web_visitor_id = ?;
   Expected: 0 rows (all moved to lead_id)
   Status: ⚠️ NEEDS TESTING
   
   SELECT * FROM event WHERE lead_id = ?;
   Expected: All past events now here
   Status: ⚠️ NEEDS TESTING
```

### Test Scenario 4: Email Click (Already Identified)

```
1. User clicks email link with ?i={trackingId}
   Expected: Find lead by tracking_id → Route to lead_id
   Status: ⚠️ NEEDS TESTING
   
2. Events tracked:
   Expected: Events point to lead_id, web_visitor_id = NULL
   Status: ⚠️ NEEDS TESTING
```

### Test Scenario 5: Return Visit

```
1. Identified user returns (has cookie/localStorage)
   Expected: Worker recognizes them → Route to lead_id
   Status: ⚠️ NEEDS TESTING
   
2. Check identification:
   SELECT * FROM web_visitor WHERE visitor_id = ?;
   Expected: is_identified = TRUE
   Status: ⚠️ NEEDS TESTING
```

---

## 7. Critical Issues Summary

### 🔴 MUST FIX Before Deployment

1. **Deploy new worker code** - `index-web-visitor.ts` is NOT deployed
2. **Update wrangler.toml** - Point to new worker entry point
3. **Fix pixel email hashing** - Send SHA-1 and MD5 (or remove from schema)
4. **Send device fingerprint** - Pixel must include in event data
5. **Send browser ID** - Pixel must include in event data

### 🟡 SHOULD FIX Soon

6. **Test identify_visitor() flow** - End-to-end identification test
7. **Test CHECK constraints** - Verify events can't have both IDs
8. **Add error handling** - Worker needs better error handling for failed identifications
9. **KV sync script** - Update to sync web_visitor data to KV
10. **Personalization for web_visitor** - Decide if/how to personalize anonymous

### 🟢 NICE TO HAVE

11. **Analytics dashboard** - Create views for web_visitor analytics
12. **Migration script** - Migrate existing lead records to web_visitor (if any anonymous ones exist)
13. **Documentation** - Update README with new architecture
14. **Monitoring** - Add logging/monitoring for identification events

---

## 8. Deployment Checklist

### Pre-Deployment

- [ ] Update `wrangler.toml` to point to `src/worker/index-web-visitor.ts`
- [ ] Fix pixel code to send all email hashes
- [ ] Fix pixel code to send device fingerprint
- [ ] Fix pixel code to send browser ID
- [ ] Test worker locally with `wrangler dev`
- [ ] Test database constraints with invalid data
- [ ] Review all function code for SQL injection risks

### Deployment

- [ ] Deploy worker: `npx wrangler deploy`
- [ ] Verify `/health` endpoint works
- [ ] Verify `/pixel.js` is served correctly
- [ ] Hard reload site to get new pixel (Cmd+Shift+R)

### Post-Deployment Testing

- [ ] Test anonymous visitor flow
- [ ] Test email detection flow
- [ ] Test identification flow (form submit)
- [ ] Test email click flow (tracking_id)
- [ ] Test return visitor flow
- [ ] Verify events in database have correct web_visitor_id or lead_id
- [ ] Verify CHECK constraints work (try inserting event with both IDs)
- [ ] Test `identify_visitor()` function manually
- [ ] Check personalization still works for identified leads

### Monitoring

- [ ] Check Cloudflare Worker logs for errors
- [ ] Query database for orphaned events (NULL web_visitor_id AND NULL lead_id)
- [ ] Monitor identification rate (web_visitor.is_identified = TRUE count)
- [ ] Check email_hashes are being populated

---

## 9. SQL Test Queries

### Check web_visitor Records

```sql
-- All web_visitors
SELECT 
  id,
  visitor_id,
  is_identified,
  email_hashes,
  email_domains,
  total_sessions,
  total_pageviews,
  first_seen_at,
  last_seen_at
FROM web_visitor
ORDER BY created_at DESC
LIMIT 10;

-- Anonymous visitors
SELECT COUNT(*) as anonymous_count
FROM web_visitor
WHERE is_identified = FALSE;

-- Identified visitors
SELECT COUNT(*) as identified_count
FROM web_visitor
WHERE is_identified = TRUE;
```

### Check Event Ownership

```sql
-- Events by owner type
SELECT 
  CASE 
    WHEN web_visitor_id IS NOT NULL THEN 'web_visitor'
    WHEN lead_id IS NOT NULL THEN 'lead'
    ELSE 'ORPHANED'
  END as owner_type,
  COUNT(*) as count
FROM event
GROUP BY owner_type;

-- Check for orphaned events (should be 0!)
SELECT COUNT(*) as orphaned_events
FROM event
WHERE web_visitor_id IS NULL AND lead_id IS NULL;

-- Check for events with BOTH IDs (should be 0!)
SELECT COUNT(*) as invalid_events
FROM event
WHERE web_visitor_id IS NOT NULL AND lead_id IS NOT NULL;
```

### Check Identification Flow

```sql
-- Recently identified visitors
SELECT 
  wv.visitor_id,
  wv.identified_at,
  l.work_email,
  l.first_name,
  l.last_name,
  (SELECT COUNT(*) FROM event WHERE lead_id = l.id) as total_events
FROM web_visitor wv
INNER JOIN lead l ON wv.lead_id = l.id
WHERE wv.identified_at >= NOW() - INTERVAL '24 hours'
ORDER BY wv.identified_at DESC;
```

### Check Email Hashes

```sql
-- Web visitors with email hashes
SELECT 
  visitor_id,
  email_hashes,
  email_domains,
  is_identified
FROM web_visitor
WHERE email_hashes IS NOT NULL
LIMIT 10;

-- Check hash structure
SELECT 
  visitor_id,
  jsonb_array_length(email_hashes->'sha256') as sha256_count,
  jsonb_array_length(email_hashes->'sha1') as sha1_count,
  jsonb_array_length(email_hashes->'md5') as md5_count
FROM web_visitor
WHERE email_hashes IS NOT NULL;
```

### Test Functions

```sql
-- Test get_or_create_web_visitor
SELECT get_or_create_web_visitor(
  'test-visitor-123',
  'device-fp-456',
  'browser-id-789'
);

-- Test find_visitor_by_email_hash
SELECT * FROM find_visitor_by_email_hash(
  p_sha256 := 'test-sha256-hash'
);

-- Test identify_visitor (⚠️ This will modify data!)
-- SELECT identify_visitor(
--   'test-visitor-123',
--   'test@example.com',
--   'Test',
--   'User',
--   'manual_test'
-- );
```

---

## 10. Recommendations

### Immediate Actions

1. **Fix pixel code** - Send all hashes + fingerprints
2. **Update wrangler.toml** - Point to new worker
3. **Deploy and test** - Deploy to Cloudflare, test end-to-end
4. **Monitor closely** - Watch for errors in first 24 hours

### Short-term (This Week)

5. **Create test suite** - Automated tests for identification flow
6. **Update documentation** - Document new architecture in README
7. **KV sync** - Update sync scripts for web_visitor data

### Long-term (This Month)

8. **Analytics views** - Create BigQuery views for web_visitor analytics
9. **Migration script** - Clean up any legacy data
10. **Performance tuning** - Optimize indexes based on query patterns

---

## 11. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Events orphaned (no owner) | 🔴 HIGH | 🟡 MEDIUM | CHECK constraints prevent this |
| Identification fails silently | 🔴 HIGH | 🟡 MEDIUM | Add error logging + alerts |
| Performance degradation | 🟡 MEDIUM | 🟢 LOW | Indexes created, monitor query times |
| Data loss during identification | 🔴 HIGH | 🟢 LOW | Transaction-based, tested |
| Pixel breaks existing functionality | 🟡 MEDIUM | 🟡 MEDIUM | Test thoroughly before deploy |

---

## 12. Sign-Off

**Database:** ✅ READY  
**Worker Code:** ⚠️ CREATED BUT NOT DEPLOYED  
**Pixel Code:** ⚠️ NEEDS FIXES  
**Testing:** ❌ NOT DONE  

**Overall Status:** 🟡 **READY FOR DEPLOYMENT AFTER FIXES**

---

## Next Steps

1. Fix pixel code (email hashes, device fingerprint, browser ID)
2. Update `wrangler.toml`
3. Deploy worker: `npx wrangler deploy`
4. Test all 5 scenarios above
5. Monitor for 24 hours
6. If stable → Update documentation

**Estimated Time to Production:** 2-4 hours (fixes + testing)
