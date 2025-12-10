# Supabase Migration Guide

## Setup Steps

### 1. Create Tables

Run the table creation SQL in Supabase SQL Editor:
- Create enums first (if not already created):
  - `event_type`
  - `event_category` 
  - `campaign_member_status`
  - `campaign_status`
  - `headcount`
  - `email_status`

- Then create tables (already done based on specs.md):
  - `lead`
  - `session`
  - `event`
  - `campaign`
  - `campaign_member`
  - `campaign_message`
  - `session_id_map`

### 2. Create Indexes

```bash
psql $DATABASE_URL < supabase/indexes.sql
```

Or run in Supabase SQL Editor:
```sql
-- Copy/paste contents of indexes.sql
```

### 3. Set Up Cloudflare Secrets

```bash
# Get your Supabase URL and service role key from Supabase dashboard
wrangler secret put SUPABASE_URL
# Enter: https://yourproject.supabase.co

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Enter: your-service-role-key (from Supabase Settings > API)

wrangler secret put EVENT_SIGNING_SECRET
# Enter: any random string (for webhook authentication)

wrangler secret put ALLOWED_ORIGINS
# Enter: comma-separated domains like: https://yourdomain.com,https://www.yourdomain.com
```

### 4. Rebuild Pixel

The pixel code needs to be rebuilt with latest changes:

```bash
npm run build:pixel
```

Then update pixel bundle (manual step):
```bash
# Convert dist/pixel.iife.js to base64
cat dist/pixel.iife.js | base64 > pixel.b64

# Update src/worker/pixel-bundle.ts with the base64 string
```

### 5. Deploy Worker

```bash
wrangler deploy
```

### 6. Test Deployment

```bash
# Test health endpoint
curl https://your-worker.workers.dev/health

# Test pixel loads
curl https://your-worker.workers.dev/pixel.js

# Test tracking (replace with your actual domain)
curl -X POST https://your-worker.workers.dev/track \
  -H "Content-Type: application/json" \
  -H "Origin: https://yourdomain.com" \
  -d '{
    "events": [{
      "type": "page_view",
      "timestamp": 1234567890,
      "sessionId": "test-123",
      "visitorId": null,
      "url": "https://test.com",
      "referrer": "",
      "data": {"title": "Test Page"}
    }]
  }'
```

### 7. Set Up Scheduled Jobs

Use Supabase cron (pg_cron extension) or external cron:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule session aggregation (every 15 minutes)
SELECT cron.schedule(
  'aggregate-sessions',
  '*/15 * * * *',
  $$ 
  -- Copy contents of session-aggregation.sql here
  $$
);

-- Schedule de-anonymization (every 15 minutes)
SELECT cron.schedule(
  'de-anonymize-visitors',
  '*/15 * * * *',
  $$
  -- Copy contents of de-anonymize.sql here
  $$
);
```

## Architecture

```
Website Visitor
    ↓
Tracking Pixel (JavaScript)
    ↓
POST /track → Cloudflare Worker
    ↓
Enrich with server-side data (IP, geo, etc.)
    ↓
Supabase PostgreSQL
    ├── event table (raw events)
    ├── lead table (visitor identity)
    └── session table (aggregated)
    ↓
Scheduled Jobs (every 15 min)
    ├── Aggregate events → sessions
    └── De-anonymize via email hashes
```

## Monitoring

Check Cloudflare Worker logs:
```bash
wrangler tail
```

Check Supabase logs:
- Go to Supabase Dashboard → Logs
- Filter by table or time range

Query recent events:
```sql
SELECT * FROM event ORDER BY created_at DESC LIMIT 100;
```

Query recent sessions:
```sql
SELECT * FROM session ORDER BY start_time DESC LIMIT 100;
```

## Troubleshooting

### Events not appearing in Supabase
1. Check Cloudflare Worker logs: `wrangler tail`
2. Verify secrets are set: `wrangler secret list`
3. Check CORS: Add your domain to `ALLOWED_ORIGINS`
4. Test health endpoint: `curl https://worker.dev/health`

### Personalization not working
1. Check KV has data: `wrangler kv:key list --binding IDENTITY_STORE`
2. Manually trigger sync: `curl -X POST https://worker.dev/sync-kv-now -H "Authorization: Bearer YOUR_SECRET"`
3. Check lead has tracking_id: `SELECT * FROM lead WHERE tracking_id IS NOT NULL LIMIT 10;`

### Session aggregation not running
1. Check pg_cron is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Check scheduled jobs: `SELECT * FROM cron.job;`
3. Check job logs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

