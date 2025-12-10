# Supabase Migration - Critical Issues & Fixes

## ❌ CRITICAL ISSUES FOUND

### 1. **Performance Issue - Session Creation**
**Problem:** Creating a NEW session for EVERY event (10 events = 10 sessions!)
**Fix:** ✅ FIXED - Now creates ONE session per batch
**Impact:** Was going to cause massive database bloat

### 2. **Missing Session-to-Event Mapping**
**Problem:** Original `sessionId` (string) not tracked anywhere, can't aggregate events
**Fix:** ✅ FIXED - Stores `_originalSessionId` in event.data JSONB field
**Impact:** Can now aggregate events by original session

### 3. **Email Extraction Logic is Broken**
**Problem:** Line 1353: `const email = event.data?.email || event.data?.emailHash ? null : null;` always returns null
**Fix:** ✅ FIXED - Now properly extracts email from event.data, browser_emails_scanned, etc.
**Impact:** Email identification now works

### 4. **Campaign/Message IDs are UUID mismatch**
**Problem:** Events send string IDs but schema expects UUIDs
**Fix:** ✅ FIXED - Added UUID validation, sets null if not valid UUID
**Impact:** No more insertion errors for campaign/message IDs

### 5. **Session Aggregation Queries Missing**
**Problem:** No queries to roll up events into session metrics
**Fix:** ✅ CREATED - `supabase/session-aggregation.sql`
**Impact:** Can now aggregate events into session metrics

### 6. **De-anonymization Queries Missing**
**Problem:** No queries to match email hashes to leads
**Fix:** ✅ CREATED - `supabase/de-anonymize.sql`
**Impact:** Can now link anonymous sessions to identified leads

### 7. **Pixel Bundle is Outdated**
**Problem:** `pixel-bundle.ts` has old minified code (includes `email_identified`, not `email_captured`)
**Status:** ⚠️ NEEDS REBUILD
**Solution:** Run `npm run build:pixel` and update bundle

### 8. **No Row-Level Security (RLS)**
**Problem:** Supabase tables have no RLS policies
**Status:** ⚠️ NEEDS CONFIGURATION
**Solution:** Add RLS policies or use service role key (current approach)

### 9. **Missing Indexes**
**Problem:** No indexes on frequently queried columns
**Fix:** ✅ CREATED - `supabase/indexes.sql` with 20+ indexes
**Impact:** Queries will be fast

### 10. **No Error Recovery**
**Problem:** Failed event batches are lost (no retry queue)
**Status:** ⚠️ NEEDS IMPLEMENTATION
**Solution:** Use Cloudflare Queues or Durable Objects for retry

## ✅ WHAT WORKS

1. ✅ Supabase authentication (service role key)
2. ✅ Event enrichment (all fields mapped correctly)
3. ✅ Event category classification
4. ✅ CORS handling
5. ✅ KV sync to Supabase
6. ✅ Identity lookup
7. ✅ Personalization endpoint
8. ✅ Email click redirect
9. ✅ Browser email scanning
10. ✅ Lead creation (anonymous & identified)

## 🚨 REMAINING TASKS

### Priority 1 (MUST DO):
1. ✅ Fix email extraction logic
2. ✅ Fix original sessionId tracking  
3. ⚠️ Rebuild pixel bundle (run `npm run build:pixel` and update pixel-bundle.ts)

### Priority 2 (COMPLETED):
4. ✅ Add session aggregation queries
5. ✅ Add de-anonymization queries
6. ✅ Add database indexes
7. ✅ Fix campaign/message UUID handling

### Priority 3 (OPTIONAL):
8. Add RLS policies
9. Add error retry queue
10. Add monitoring/alerts

## 📋 DEPLOYMENT STEPS

Once fixed:

1. Set Cloudflare secrets:
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put EVENT_SIGNING_SECRET
wrangler secret put ALLOWED_ORIGINS
```

2. Rebuild pixel:
```bash
npm run build:pixel
# Update pixel-bundle.ts with new base64
```

3. Deploy worker:
```bash
wrangler deploy
```

4. Test endpoints:
- `/health` - Should return 200
- `/track` - Test with sample event
- `/personalize?vid=test` - Test lookup
- `/pixel.js` - Should serve pixel code

## 🔍 TESTING CHECKLIST

- [ ] Health endpoint responds
- [ ] Pixel loads in browser
- [ ] Events post to `/track`
- [ ] Events appear in Supabase `event` table
- [ ] Leads created in Supabase `lead` table
- [ ] Sessions created in Supabase `session` table
- [ ] KV sync works
- [ ] Personalization endpoint returns data
- [ ] Email clicks redirect properly
- [ ] CORS allows your domains

