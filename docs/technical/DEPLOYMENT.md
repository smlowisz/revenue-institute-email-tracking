# Outbound Intent Engine - Deployment Guide

Complete step-by-step guide to deploy the Outbound Intent Engine.

---

## 📋 Prerequisites

Before you begin, ensure you have:

- ✅ **Cloudflare Account** (Pro plan or higher recommended)
- ✅ **Google Cloud Platform Account** with BigQuery enabled
- ✅ **Node.js 18+** and npm installed
- ✅ **Domain** with DNS managed by Cloudflare (for Workers)
- ✅ **Email sending tool** (Smartlead, Instantly, Lemlist, etc.)

---

## 🚀 Step 1: Initial Setup

### 1.1 Clone and Install

```bash
git clone <your-repo>
cd revenue-institute-email-tracking
npm install
```

### 1.2 Environment Setup

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see sections below).

---

## ☁️ Step 2: Cloudflare Setup

### 2.1 Create KV Namespaces

```bash
# Create Identity Store KV
wrangler kv:namespace create "IDENTITY_STORE"
wrangler kv:namespace create "IDENTITY_STORE" --preview

# Create Personalization KV
wrangler kv:namespace create "PERSONALIZATION"
wrangler kv:namespace create "PERSONALIZATION" --preview
```

Copy the namespace IDs output and update `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "IDENTITY_STORE", id = "YOUR_ID_HERE", preview_id = "YOUR_PREVIEW_ID" },
  { binding = "PERSONALIZATION", id = "YOUR_PERSONALIZATION_ID", preview_id = "YOUR_PREVIEW_ID" }
]
```

### 2.2 Set Cloudflare Secrets

```bash
# BigQuery credentials
wrangler secret put BIGQUERY_PROJECT_ID
# Enter: your-gcp-project-id

wrangler secret put BIGQUERY_DATASET
# Enter: outbound_sales

wrangler secret put BIGQUERY_CREDENTIALS
# Paste entire JSON service account key (from Step 3)

# Security
wrangler secret put EVENT_SIGNING_SECRET
# Enter: random 32+ character string

wrangler secret put ALLOWED_ORIGINS
# Enter: https://yourdomain.com,https://www.yourdomain.com
```

### 2.3 Deploy Worker

```bash
# Test locally first
npm run dev:worker

# Deploy to production
npm run deploy:worker
```

Your worker will be available at: `https://your-worker.your-subdomain.workers.dev`

### 2.4 Set Custom Domain (Recommended)

In Cloudflare Dashboard:
1. Go to Workers & Pages → Your Worker
2. Click "Triggers" tab
3. Add custom domain: `track.yourdomain.com`

---

## 📊 Step 3: BigQuery Setup

### 3.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing
3. Enable BigQuery API

### 3.2 Create Service Account

```bash
# In Google Cloud Console:
# 1. IAM & Admin → Service Accounts → Create Service Account
# 2. Name: "outbound-intent-engine"
# 3. Grant roles:
#    - BigQuery Data Editor
#    - BigQuery Job User
# 4. Create key (JSON) and download
```

Save the JSON key file as `service-account.json` (don't commit to git!).

### 3.3 Create Dataset and Tables

```bash
# Login to gcloud
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Create dataset
bq mk --dataset --location=US outbound_sales

# Create tables from schema
bq query --use_legacy_sql=false < bigquery/schema.sql
```

### 3.4 Set Up Scheduled Queries

In BigQuery Console:

**Query 1: Session Aggregation (every 5 min)**
- Schedule: Every 5 minutes
- Dataset: `outbound_sales`
- Query: First query from `bigquery/scoring-queries.sql`

**Query 2: Lead Profile Updates (every 15 min)**
- Schedule: Every 15 minutes
- Dataset: `outbound_sales`
- Query: Second query from `bigquery/scoring-queries.sql`

**Query 3: KV Sync (every hour)**
- Schedule: Every 1 hour
- Destination: Cloud Storage bucket
- Query: Third query from `bigquery/scoring-queries.sql`

**Query 4: Hot Lead Alerts (every 15 min)**
- Schedule: Every 15 minutes
- Destination: Pub/Sub topic (for CRM sync)
- Query: Fourth query from `bigquery/scoring-queries.sql`

---

## 🎨 Step 4: Deploy Tracking Pixel

### 4.1 Build Pixel

```bash
npm run build:pixel
```

This creates `dist/pixel.js` (~10KB minified).

### 4.2 Deploy to CDN

**Option A: Cloudflare Pages**

```bash
# Create Pages project
wrangler pages project create outbound-pixel

# Deploy
wrangler pages deploy dist
```

**Option B: Your existing CDN**

Upload `dist/pixel.js` to your website's `/js/` directory.

### 4.3 Add to Website

Add to your website's `<head>` or before `</body>`:

```html
<script>
  window.oieConfig = {
    endpoint: 'https://track.yourdomain.com/track',
    debug: false  // Set true for testing
  };
</script>
<script src="https://yourdomain.com/js/pixel.js"></script>
```

---

## 📧 Step 5: Create Your First Campaign

### 5.1 Prepare Lead List

Create a CSV file with your leads:

```csv
email,firstName,lastName,company
john@acme.com,John,Doe,Acme Corp
jane@widget.com,Jane,Smith,Widget Co
```

See `examples/sample-leads.csv` for format.

### 5.2 Generate Tracking URLs

```bash
node scripts/create-campaign.ts \
  --campaign "Q1 2024 Outbound" \
  --file leads.csv \
  --baseUrl https://yourdomain.com \
  --landingPage /demo \
  --output campaign-urls.csv
```

This creates:
- `campaign-urls.csv` - Import to your email tool
- `campaign-xxx-identities.json` - For syncing to KV/BigQuery

### 5.3 Sync Identities

**Sync to Cloudflare KV:**

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export KV_IDENTITY_STORE_ID="your-kv-namespace-id"
export CLOUDFLARE_API_TOKEN="your-api-token"

node scripts/sync-identities-kv.ts \
  --file campaign-xxx-identities.json
```

**Sync to BigQuery:**

```bash
export BIGQUERY_PROJECT_ID="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"

node scripts/sync-identities-bigquery.ts \
  --file campaign-xxx-identities.json
```

### 5.4 Import to Email Tool

1. Open your email sending platform (Smartlead, Instantly, etc.)
2. Create new campaign
3. Import `campaign-urls.csv`
4. Map columns:
   - Email → Email
   - First Name → {{firstName}}
   - Company → {{company}}
   - **Tracking URL → Use as CTA button/link**

Example email:

```
Hi {{firstName}},

I noticed {{company}} is in the [industry] space...

[Your pitch]

Would love to show you how we can help:
→ Check out our demo: {{trackingUrl}}

Best,
[Your name]
```

---

## 🧪 Step 6: Testing

### 6.1 Test Tracking Pixel

```bash
# Start local dev server
npm run dev:pixel
npm run dev:worker
```

Open `examples/example-page.html` and:
1. Add `?i=test123` to URL
2. Open browser console (debug mode)
3. Interact with page (scroll, click, etc.)
4. Verify events in console

### 6.2 Test End-to-End

1. Create test identity:
```bash
# Add to KV manually via Wrangler
wrangler kv:key put --binding=IDENTITY_STORE "test123" \
  '{"shortId":"test123","email":"test@example.com","firstName":"Test","company":"Test Co","campaignId":"test"}'
```

2. Visit: `https://yourdomain.com/?i=test123`

3. Check BigQuery:
```sql
SELECT * FROM `outbound_sales.events` 
WHERE visitorId = 'test123' 
ORDER BY timestamp DESC 
LIMIT 10;
```

---

## 📊 Step 7: Set Up Dashboards

### 7.1 Looker Studio (Free)

1. Go to [Looker Studio](https://lookerstudio.google.com)
2. Create new report
3. Connect to BigQuery
4. Select dataset: `outbound_sales`
5. Use views:
   - `high_intent_leads`
   - `campaign_performance`
   - `recent_sessions`
   - `intent_distribution`

### 7.2 Sample Queries

**Top 10 Hot Leads:**
```sql
SELECT 
  email,
  firstName,
  company,
  intentScore,
  lastVisitAt,
  pricingPageVisits
FROM `outbound_sales.high_intent_leads`
ORDER BY intentScore DESC
LIMIT 10;
```

**Campaign ROI:**
```sql
SELECT 
  campaignName,
  totalRecipients,
  clicks,
  highIntentLeads,
  ROUND(highIntentLeads / totalRecipients * 100, 2) as conversionRate
FROM `outbound_sales.campaign_performance`
ORDER BY conversionRate DESC;
```

---

## 🔄 Step 8: CRM Integration (Optional)

### 8.1 Set Up n8n Workflow

1. Deploy n8n (self-hosted or cloud)
2. Create workflow:
   - Trigger: BigQuery Pub/Sub (hot leads)
   - Action: Create/Update contact in CRM
   - Fields: email, name, company, intentScore

### 8.2 Zapier Alternative

Create Zap:
1. Trigger: Schedule (every 15 min)
2. Action: Run BigQuery query (hot leads)
3. Action: Create/Update in CRM (HubSpot, Salesforce, etc.)

---

## 📈 Step 9: Monitoring & Optimization

### 9.1 Monitor Worker Performance

```bash
wrangler tail
```

### 9.2 BigQuery Cost Optimization

- Set partition expiration (already configured: 2 years)
- Use clustered queries on `visitorId`, `sessionId`
- Monitor query costs in GCP Console

### 9.3 Adjust Intent Scoring

Edit `bigquery/scoring-queries.sql` to tune scoring weights based on your ICP.

---

## 🆘 Troubleshooting

### Events Not Appearing in BigQuery

1. Check Worker logs: `wrangler tail`
2. Verify BigQuery credentials are correct
3. Check table streaming buffer: May take 1-2 minutes

### Visitor ID Not Persisting

1. Check browser localStorage/cookies not blocked
2. Verify first-party cookies enabled
3. Check CORS headers in Worker

### Personalization Not Working

1. Verify KV contains visitor data
2. Check browser console for errors
3. Ensure Worker `/personalize` endpoint works

### High BigQuery Costs

1. Review scheduled query frequency
2. Add partition filters to queries
3. Consider sampling for very high volume

---

## 🔐 Security Best Practices

1. ✅ Rotate `EVENT_SIGNING_SECRET` quarterly
2. ✅ Use least-privilege service account roles
3. ✅ Enable Cloudflare Bot Management
4. ✅ Set up rate limiting on Worker
5. ✅ Never expose BigQuery credentials client-side
6. ✅ Hash all PII (emails) in BigQuery
7. ✅ Regular audit of KV access patterns

---

## 📚 Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers)
- [BigQuery Best Practices](https://cloud.google.com/bigquery/docs/best-practices)
- [Web Analytics Privacy Guide](https://web.dev/analytics-and-performance)

---

## 🎉 You're Done!

Your Outbound Intent Engine is now live. Start sending campaigns and watch the intent data flow in!

**Next Steps:**
- Create your first campaign
- Set up daily reports
- Configure CRM sync
- Tune scoring algorithm
- Build custom dashboards

Questions? Issues? Check GitHub issues or reach out to support.

