# 🚀 web_visitor Architecture - READY TO DEPLOY

**Date:** December 10, 2025  
**Status:** 🟢 ALL FIXES COMPLETE - READY FOR PRODUCTION

---

## ✅ Completed Fixes

### Database Changes
- [x] Created `web_visitor` table
- [x] Added `web_visitor_id` to `event` and `session` tables
- [x] Added `email_hashes` (JSONB) to `web_visitor` and `lead`
- [x] Added CHECK constraints (mutually exclusive ownership)
- [x] Created 23 indexes (including GIN indexes for JSONB)
- [x] Created 5 helper functions
- [x] Created 4 analytical views
- [x] Added triggers for auto-updating timestamps

### Code Changes
- [x] Fixed pixel email hashing - now generates SHA-256, SHA-1, and MD5
- [x] Fixed pixel to send device fingerprint in page_view
- [x] Fixed pixel to send browser ID in page_view
- [x] Updated wrangler.toml to use new worker
- [x] Updated worker to handle personalization for web_visitor
- [x] Updated worker to extract all 3 hash types
- [x] Rebuilt pixel bundle (23.64 KB)

---

## 📁 Key Files

### Production Files (Deploy These)
1. **`src/worker/index-web-visitor.ts`** - New worker with web_visitor logic
2. **`src/worker/supabase-web-visitor.ts`** - Supabase client
3. **`src/pixel/index.ts`** - Updated pixel with MD5 + fingerprints
4. **`src/worker/pixel-bundle.ts`** - Rebuilt bundle
5. **`wrangler.toml`** - Updated to point to new worker

### Database Files (Already Applied)
6. **`supabase/add-missing-features.sql`** - All database changes applied ✅
7. **`supabase/schema-web-visitor.sql`** - Reference schema
8. **`supabase/migration-to-web-visitor.sql`** - Migration script (if needed)

### Documentation
9. **`QA_WEB_VISITOR_ARCHITECTURE.md`** - Comprehensive QA report
10. **`FIXES_APPLIED.md`** - All fixes documented
11. **`TEST_WEB_VISITOR.sql`** - Test queries
12. **`supabase/EVENT_TRACKING_ARCHITECTURE.md`** - How events track
13. **`supabase/EMAIL_HASH_STORAGE.md`** - Hash storage details
14. **`ARCHITECTURE_SUMMARY.md`** - Complete overview

---

## 🚀 Deployment Steps

### Step 1: Final Check
```bash
# Verify you're in the right directory
pwd
# Should be: .../revenue-institute-email-tracking

# Check git status
git status
```

### Step 2: Deploy Worker
```bash
npx wrangler deploy
```

**Expected output:**
```
✅ Deployed to https://intel.revenueinstitute.com
```

### Step 3: Verify Health
```bash
curl https://intel.revenueinstitute.com/health
```

**Expected response:**
```json
{"status":"ok","timestamp":1733847123456}
```

### Step 4: Verify Pixel Endpoint
```bash
curl https://intel.revenueinstitute.com/pixel.js | head -20
```

**Expected:** Should return JavaScript code

### Step 5: Hard Reload Website
```
1. Open https://revenueinstitute.com
2. Press Cmd+Shift+R (hard reload to clear cache)
3. Open browser console
4. Should see: "[OutboundIntentTracker] Tracker initialized"
```

---

## 🧪 Testing Checklist

### Test 1: Anonymous Visitor ⏱️ 5 minutes

**Steps:**
1. Visit site in incognito/private window
2. Browse 2-3 pages
3. Close browser

**Verify in Database:**
```sql
-- Should see new web_visitor record
SELECT * FROM web_visitor 
WHERE created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 1;

-- Should see events linked to web_visitor_id
SELECT COUNT(*) FROM event
WHERE web_visitor_id = (
  SELECT id FROM web_visitor 
  WHERE created_at >= NOW() - INTERVAL '10 minutes'
  ORDER BY created_at DESC LIMIT 1
);
```

### Test 2: Email Detection ⏱️ 5 minutes

**Steps:**
1. Visit site
2. Open browser console
3. Run: `localStorage.setItem('test_email', 'john@company.com')`
4. Wait 30 seconds (pixel scans every 30s)
5. Check console for: "Found X email(s) in browser storage"

**Verify in Database:**
```sql
-- Should see email hashes stored
SELECT 
  visitor_id,
  email_hashes,
  email_domains
FROM web_visitor
WHERE email_hashes IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;
```

### Test 3: Form Submit → Identification ⏱️ 10 minutes

**Steps:**
1. Visit site (anonymous)
2. Submit a form with email
3. Check browser console for events

**Verify in Database:**
```sql
-- Check web_visitor was identified
SELECT 
  visitor_id,
  is_identified,
  identified_at,
  lead_id
FROM web_visitor
WHERE identified_at >= NOW() - INTERVAL '15 minutes';

-- Check lead was created
SELECT 
  id,
  work_email,
  original_visitor_id,
  identification_method
FROM lead
WHERE identified_at >= NOW() - INTERVAL '15 minutes';

-- Check events were moved
SELECT 
  COUNT(*) FILTER (WHERE web_visitor_id IS NOT NULL) as on_web_visitor,
  COUNT(*) FILTER (WHERE lead_id IS NOT NULL) as on_lead
FROM event
WHERE created_at >= NOW() - INTERVAL '15 minutes';
-- on_web_visitor should be 0, on_lead should be > 0
```

### Test 4: Email Click (Tracking ID) ⏱️ 5 minutes

**Steps:**
1. Create test link: `https://revenueinstitute.com?i=test-tracking-123`
2. Visit link
3. Browse site

**Verify in Database:**
```sql
-- Should route to lead (not web_visitor)
SELECT * FROM event
WHERE created_at >= NOW() - INTERVAL '10 minutes'
  AND lead_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

### Test 5: Personalization ⏱️ 5 minutes

**Steps:**
1. Visit: `https://intel.revenueinstitute.com/personalize?vid=test-tracking-123`

**Expected Response:**
```json
{
  "personalized": true,
  "firstName": "...",
  "email": "...",
  "company": "..."
}
```

---

## 📊 Monitoring (First 24 Hours)

### Cloudflare Dashboard

Watch for:
- ✅ Request success rate > 95%
- ✅ No 500 errors
- ✅ Average response time < 100ms

### Database Queries

Run every 4 hours:

```sql
-- Check for orphaned events
SELECT COUNT(*) as orphaned_events
FROM event
WHERE web_visitor_id IS NULL AND lead_id IS NULL;
-- Should always be 0

-- Check identification rate
SELECT 
  COUNT(*) FILTER (WHERE is_identified = TRUE) as identified,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_identified = TRUE) / COUNT(*), 2) as rate
FROM web_visitor;
```

### Error Patterns

Watch worker logs for:
- ❌ "Failed to create web_visitor"
- ❌ "Event must have exactly one of web_visitor_id or lead_id"
- ❌ "Session must have exactly one of webVisitorId or leadId"

---

## 🎯 Success Criteria

After 24 hours, all must be TRUE:

- [ ] 0 orphaned events (neither web_visitor_id nor lead_id)
- [ ] 0 events with both IDs
- [ ] Identification flow working (web_visitor → lead)
- [ ] Email hashes populated (all 3 types)
- [ ] Device fingerprints stored
- [ ] Browser IDs stored
- [ ] Personalization working for identified leads
- [ ] No worker errors in Cloudflare logs
- [ ] < 1% error rate on /track endpoint

---

## 🚨 Rollback Instructions

If critical issues arise:

```bash
# 1. Revert wrangler.toml
git checkout wrangler.toml

# 2. Redeploy old worker
npx wrangler deploy

# 3. Database is safe - new columns are nullable
# Old worker will ignore web_visitor_id columns
```

**Data Safety:**
- ✅ All new columns are nullable
- ✅ Old worker will continue using lead_id
- ✅ No data loss if rolling back
- ✅ Can roll forward after fixing issues

---

## 📞 Support Queries

If things go wrong, run these diagnostic queries:

### Diagnostic 1: Find Recent Errors
```sql
-- Events created in last hour with issues
SELECT 
  id,
  type,
  web_visitor_id,
  lead_id,
  created_at,
  CASE 
    WHEN web_visitor_id IS NULL AND lead_id IS NULL THEN 'ORPHANED'
    WHEN web_visitor_id IS NOT NULL AND lead_id IS NOT NULL THEN 'BOTH_IDS'
    ELSE 'OK'
  END as status
FROM event
WHERE created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Diagnostic 2: Check Visitor-to-Lead Links
```sql
-- Web visitors that should be linked to leads
SELECT 
  wv.visitor_id,
  wv.is_identified,
  wv.lead_id,
  l.work_email
FROM web_visitor wv
LEFT JOIN lead l ON wv.lead_id = l.id
WHERE wv.is_identified = TRUE
  AND wv.lead_id IS NULL;
-- Should be 0 rows
```

### Diagnostic 3: Find Identification Issues
```sql
-- Leads without corresponding web_visitor
SELECT 
  l.id,
  l.work_email,
  l.original_visitor_id,
  (SELECT COUNT(*) FROM web_visitor WHERE lead_id = l.id) as web_visitor_count
FROM lead l
WHERE l.identified_at >= NOW() - INTERVAL '24 hours';
-- web_visitor_count should be 1 for each lead
```

---

## 🎉 Deployment Command

```bash
npx wrangler deploy
```

**That's it!** Everything is ready.

---

## 📝 Post-Deployment TODO

After successful deployment:
1. [ ] Monitor for 24 hours
2. [ ] Run all test queries in `TEST_WEB_VISITOR.sql`
3. [ ] Update main README.md with new architecture
4. [ ] Update KV sync scripts (if any)
5. [ ] Create dashboard/analytics for web_visitor insights
6. [ ] Document common query patterns
7. [ ] Set up alerts for orphaned events

---

**Status:** 🟢 **READY TO DEPLOY NOW**

**Time to Production:** < 5 minutes (just deploy + test)
