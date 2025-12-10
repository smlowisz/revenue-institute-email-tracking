# Deploy to Supabase - Complete Guide

## Prerequisites

- ✅ Supabase project created
- ✅ Tables created (lead, session, event, campaign, campaign_member, campaign_message, session_id_map)
- ✅ Enums created (event_type, event_category, etc.)
- ✅ Cloudflare Workers account

## Step 1: Configure Supabase

### 1a. Get Your Credentials

Go to Supabase Dashboard → Settings → API:
- Copy `Project URL` (e.g., `https://abcdefgh.supabase.co`)
- Copy `service_role` secret key (NOT the anon key!)

### 1b. Create Indexes

Run in Supabase SQL Editor:
```bash
# Copy/paste contents of supabase/indexes.sql
```

This creates indexes on:
- `lead.tracking_id` (for fast lookups)
- `event.lead_id`, `event.session_id`, `event.type` (for queries)
- `event.created_at` (for time-based queries)
- Plus 10+ other critical indexes

### 1c. Enable pg_cron (Optional but Recommended)

For automated session aggregation and de-anonymization:

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule session aggregation (every 15 minutes)
SELECT cron.schedule(
  'aggregate-sessions-15min',
  '*/15 * * * *',
  $$ 
  -- Paste contents of supabase/session-aggregation.sql here
  $$
);

-- Schedule de-anonymization (every 15 minutes)  
SELECT cron.schedule(
  'de-anonymize-15min',
  '*/15 * * * *',
  $$
  -- Paste contents of supabase/de-anonymize.sql here
  $$
);
```

## Step 2: Configure Cloudflare Worker

### 2a. Set Secrets

```bash
cd "/Users/stephenlowisz/Documents/Github-Cursor/Revenue Institute/revenue-institute-email-tracking"

# Set Supabase URL
wrangler secret put SUPABASE_URL
# Enter: https://yourproject.supabase.co

# Set Supabase service role key
wrangler secret put SUPABASE_SERVICE_ROLE_KEY  
# Enter: eyJhbGc...your-service-role-key

# Set event signing secret (for webhook authentication)
wrangler secret put EVENT_SIGNING_SECRET
# Enter: any-random-secure-string-here

# Set allowed origins (your website domains)
wrangler secret put ALLOWED_ORIGINS
# Enter: https://revenueinstitute.com,https://www.revenueinstitute.com
```

### 2b. Verify Secrets

```bash
wrangler secret list
```

Should show:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- EVENT_SIGNING_SECRET
- ALLOWED_ORIGINS

## Step 3: Build & Deploy

### 3a. Install Dependencies

```bash
npm install
```

### 3b. Build Pixel (CRITICAL!)

The pixel bundle is OUTDATED and needs to be rebuilt:

```bash
npm run build:pixel
```

This creates `dist/pixel.iife.js` with the latest pixel code.

### 3c. Update Pixel Bundle

Convert to base64 and update the bundle file:

```bash
# Convert to base64 (macOS/Linux)
base64 -i dist/pixel.iife.js | tr -d '\n' > pixel.b64

# On macOS specifically:
base64 -i dist/pixel.iife.js -o pixel.b64

# Then manually copy the content into src/worker/pixel-bundle.ts
# Replace the string in PIXEL_CODE_BASE64 = '...'
```

**Or use this Node script:**

```javascript
// update-pixel-bundle.js
const fs = require('fs');
const pixelCode = fs.readFileSync('dist/pixel.iife.js', 'utf8');
const base64 = Buffer.from(pixelCode).toString('base64');
const content = `export const PIXEL_CODE_BASE64 = '${base64}';\n`;
fs.writeFileSync('src/worker/pixel-bundle.ts', content);
console.log('✅ Pixel bundle updated!');
```

Run it:
```bash
node update-pixel-bundle.js
```

### 3d. Deploy to Cloudflare

```bash
wrangler deploy
```

Expected output:
```
✨ Built successfully!
🚀 Deployed to https://outbound-intent-engine.your-account.workers.dev
```

## Step 4: Test Everything

### 4a. Test Health Endpoint

```bash
curl https://your-worker.workers.dev/health
```

Expected: `{"status":"ok","timestamp":1234567890}`

### 4b. Test Pixel Loads

```bash
curl https://your-worker.workers.dev/pixel.js
```

Expected: JavaScript code (should be minified and start with tracking logic)

### 4c. Test Event Tracking

```bash
curl -X POST https://your-worker.workers.dev/track \
  -H "Content-Type: application/json" \
  -H "Origin: https://revenueinstitute.com" \
  -d '{
    "events": [{
      "type": "page_view",
      "timestamp": '$(date +%s000)',
      "sessionId": "test-session-123",
      "visitorId": null,
      "url": "https://revenueinstitute.com/test",
      "referrer": "",
      "data": {
        "title": "Test Page",
        "path": "/test"
      }
    }],
    "meta": {
      "sentAt": '$(date +%s000)'
    }
  }'
```

Expected: `{"success":true,"stored":true}`

### 4d. Verify in Supabase

```sql
-- Check event was stored
SELECT * FROM event ORDER BY created_at DESC LIMIT 1;

-- Check lead was created
SELECT * FROM lead ORDER BY created_at DESC LIMIT 1;

-- Check session was created
SELECT * FROM session ORDER BY created_at DESC LIMIT 1;
```

### 4e. Test KV Sync

Manually trigger:
```bash
curl -X POST https://your-worker.workers.dev/sync-kv-now \
  -H "Authorization: Bearer YOUR_EVENT_SIGNING_SECRET"
```

Expected: `{"success":true,"message":"KV sync completed"}`

### 4f. Test Personalization

```bash
# First, ensure you have a lead with tracking_id
# Then test lookup
curl "https://your-worker.workers.dev/personalize?vid=YOUR_TRACKING_ID"
```

Expected: JSON with personalization data

## Step 5: Add Pixel to Your Website

```html
<!-- Add to <head> or before </body> -->
<script>
  window.oieConfig = {
    endpoint: 'https://your-worker.workers.dev/track',
    debug: true  // Set false in production
  };
</script>
<script src="https://your-worker.workers.dev/pixel.js"></script>
```

## Monitoring

### Check Logs

```bash
# Real-time logs
wrangler tail

# Filter for errors
wrangler tail | grep ERROR
```

### Check Database

```sql
-- Event counts by type
SELECT type, category, COUNT(*) as count
FROM event
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY type, category
ORDER BY count DESC;

-- Recent sessions
SELECT 
  s.id,
  l.tracking_id,
  l.work_email,
  s.start_time,
  s.pageviews,
  s.engagement_score
FROM session s
JOIN lead l ON s.lead_id = l.id
ORDER BY s.start_time DESC
LIMIT 20;

-- Anonymous vs identified leads
SELECT 
  CASE 
    WHEN work_email IS NOT NULL OR personal_email IS NOT NULL THEN 'identified'
    ELSE 'anonymous'
  END as lead_status,
  COUNT(*) as count
FROM lead
GROUP BY lead_status;
```

## Common Issues

### Issue: Events not appearing in database

**Check:**
1. Cloudflare logs: `wrangler tail`
2. CORS: Is your domain in `ALLOWED_ORIGINS`?
3. Supabase logs: Dashboard → Logs
4. Network tab in browser: Are events being sent?

**Fix:**
```bash
# Update allowed origins
wrangler secret put ALLOWED_ORIGINS
# Add your domain
```

### Issue: "Supabase error: 401"

**Problem:** Invalid service role key

**Fix:**
```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Re-enter the key from Supabase dashboard
```

### Issue: "Table does not exist"

**Problem:** Tables not created in Supabase

**Fix:**
- Go to Supabase SQL Editor
- Run table creation SQL from specs.md
- Run indexes.sql

### Issue: Slow performance

**Problem:** Missing indexes

**Fix:**
```bash
# Run indexes.sql
psql $DATABASE_URL < supabase/indexes.sql
```

### Issue: Sessions not aggregating

**Problem:** Scheduled job not set up

**Fix:**
- Set up pg_cron (see Step 5)
- Or run manually every hour:
  ```sql
  -- Paste session-aggregation.sql
  ```

## Success Criteria

✅ Health endpoint returns 200
✅ Pixel.js loads without errors  
✅ Events post successfully
✅ Events appear in Supabase `event` table
✅ Leads created in `lead` table
✅ Sessions created in `session` table
✅ KV sync works (leads in Cloudflare KV)
✅ Personalization endpoint returns data
✅ No errors in Cloudflare logs
✅ No errors in Supabase logs

## Next Steps

1. Add your website domain to `ALLOWED_ORIGINS`
2. Add pixel to your website
3. Monitor for 24 hours
4. Set up session aggregation cron
5. Set up de-anonymization cron
6. Import existing leads to Supabase `lead` table
7. Create campaigns in Supabase

## Need Help?

Check:
- `supabase/README.md` - This file
- `SUPABASE_MIGRATION_CHECKLIST.md` - All issues and fixes
- Cloudflare logs: `wrangler tail`
- Supabase logs: Dashboard → Logs

