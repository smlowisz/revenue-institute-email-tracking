# Development Guide

Guide for developers working on the Outbound Intent Engine.

---

## 🛠️ Setup Development Environment

### Prerequisites

```bash
node --version  # v18+
npm --version   # v9+
```

### Initial Setup

```bash
# Clone repo
git clone <repo-url>
cd revenue-institute-email-tracking

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your local credentials
nano .env
```

---

## 🏃 Running Locally

### Start Tracking Pixel Dev Server

```bash
npm run dev:pixel
```

Opens Vite dev server at `http://localhost:5173`

### Start Cloudflare Worker Locally

```bash
npm run dev:worker
```

Starts local worker at `http://localhost:8787`

**Available endpoints:**
- `http://localhost:8787/track` - Event ingestion
- `http://localhost:8787/health` - Health check
- `http://localhost:8787/go?i=test123&to=/` - Redirect test

### Test Example Page

```bash
# In one terminal
npm run dev:pixel

# In another terminal
npm run dev:worker

# Open browser
open examples/example-page.html
```

Add `?i=test123` to URL to simulate tracked visitor.

---

## 🧪 Testing

### Manual Testing

1. **Test event tracking:**
```bash
curl -X POST http://localhost:8787/track \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "pageview",
      "timestamp": 1234567890,
      "sessionId": "test-session",
      "visitorId": "test-visitor",
      "url": "https://example.com",
      "referrer": ""
    }],
    "meta": {"sentAt": 1234567890}
  }'
```

Expected response:
```json
{"success": true, "eventsReceived": 1}
```

2. **Test identity lookup:**
```bash
curl http://localhost:8787/identify?i=test123
```

3. **Test redirect:**
```bash
curl -I http://localhost:8787/go?i=test123&to=/demo
```

### Build Tests

```bash
# Build pixel
npm run build:pixel

# Verify size
ls -lh dist/pixel.js  # Should be <12KB
```

---

## 📝 Project Structure

```
revenue-institute-email-tracking/
├── src/
│   ├── pixel/              # Client-side tracking pixel
│   │   ├── index.ts        # Main tracker class
│   │   └── personalization.ts  # Personalization module
│   ├── worker/             # Cloudflare Worker
│   │   └── index.ts        # Event ingestion & routing
│   └── utils/              # Shared utilities
│       └── identity-generator.ts  # Campaign URL generation
│
├── scripts/                # CLI tools
│   ├── create-campaign.ts  # Generate tracking URLs
│   ├── sync-identities-kv.ts  # Sync to Cloudflare KV
│   └── sync-identities-bigquery.ts  # Sync to BigQuery
│
├── bigquery/               # Database schema
│   ├── schema.sql          # Table definitions
│   └── scoring-queries.sql # Scheduled queries
│
├── examples/               # Example implementations
│   ├── example-page.html   # Demo landing page
│   └── sample-leads.csv    # Sample lead data
│
├── dist/                   # Build output
│   └── pixel.js            # Compiled tracking pixel
│
├── package.json            # Dependencies & scripts
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Vite build config
├── wrangler.toml           # Cloudflare Worker config
│
├── README.md               # Product spec
├── DEPLOYMENT.md           # Deployment guide
├── ARCHITECTURE.md         # Technical architecture
└── DEVELOPMENT.md          # This file
```

---

## 🔨 Development Workflow

### 1. Making Changes to Tracking Pixel

```bash
# Edit src/pixel/index.ts

# Test in browser
npm run dev:pixel
open examples/example-page.html?i=test

# Build
npm run build:pixel

# Verify size
ls -lh dist/pixel.js
```

### 2. Making Changes to Worker

```bash
# Edit src/worker/index.ts

# Test locally
npm run dev:worker

# Test endpoint
curl http://localhost:8787/health

# Deploy to dev
wrangler deploy --env staging

# Deploy to production
npm run deploy:worker
```

### 3. Updating BigQuery Schema

```bash
# Edit bigquery/schema.sql

# Test query locally
bq query --use_legacy_sql=false < bigquery/schema.sql

# Deploy to production (careful!)
bq query --use_legacy_sql=false --project_id=YOUR_PROJECT < bigquery/schema.sql
```

### 4. Creating a New Event Type

**Step 1:** Add to pixel (`src/pixel/index.ts`)
```typescript
private trackNewEvent(): void {
  this.trackEvent('new_event_type', {
    customField: 'value',
    timestamp: Date.now()
  });
}
```

**Step 2:** Update BigQuery schema if needed
```sql
-- Add to data JSON field (no schema change needed)
-- OR add new column:
ALTER TABLE `outbound_sales.events`
ADD COLUMN newField STRING;
```

**Step 3:** Update scoring queries if relevant
```sql
-- In bigquery/scoring-queries.sql
COUNTIF(type = 'new_event_type') as newEventCount
```

**Step 4:** Test end-to-end
```bash
npm run dev:pixel
npm run dev:worker
# Trigger event in browser
# Check BigQuery
```

---

## 🐛 Debugging

### Enable Debug Mode

**Pixel:**
```javascript
window.oieConfig = {
  endpoint: 'http://localhost:8787/track',
  debug: true  // Enables console.log
};
```

**Worker:**
```bash
wrangler tail  # Stream logs in real-time
```

### Common Issues

**Issue: Events not reaching BigQuery**

1. Check worker logs:
```bash
wrangler tail --format pretty
```

2. Verify BigQuery credentials:
```bash
curl -X POST http://localhost:8787/track \
  -H "Content-Type: application/json" \
  -d '{"events":[...]}'
# Check response + logs
```

3. Test BigQuery API directly:
```bash
# Get OAuth token
gcloud auth print-access-token

# Test streaming insert
curl -X POST \
  "https://bigquery.googleapis.com/bigquery/v2/projects/PROJECT/datasets/DATASET/tables/events/insertAll" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"json":{"type":"test","timestamp":1234567890}}]}'
```

**Issue: Visitor ID not persisting**

1. Check localStorage:
```javascript
// In browser console
localStorage.getItem('_oie_visitor')
```

2. Check cookies:
```javascript
document.cookie
```

3. Verify URL parameter:
```javascript
new URLSearchParams(window.location.search).get('i')
```

**Issue: CORS errors**

1. Check `ALLOWED_ORIGINS` in worker
2. Verify origin header:
```bash
curl -H "Origin: https://yourdomain.com" \
  http://localhost:8787/track
```

---

## 📦 Building for Production

### Build Pixel

```bash
npm run build:pixel
```

Output: `dist/pixel.js` (~10KB gzipped)

### Deploy Worker

```bash
# Staging
wrangler deploy --env staging

# Production
wrangler deploy --env production
# or
npm run deploy:worker
```

### Deploy Pixel to CDN

**Cloudflare Pages:**
```bash
wrangler pages deploy dist
```

**Your CDN:**
```bash
# Upload dist/pixel.js to your CDN
scp dist/pixel.js user@cdn:/var/www/js/
```

---

## 🔧 Configuration

### Environment Variables

**Development (`.env`):**
```bash
BIGQUERY_PROJECT_ID=your-project-dev
BIGQUERY_DATASET=outbound_sales_dev
GOOGLE_APPLICATION_CREDENTIALS=./service-account-dev.json
```

**Production (Wrangler secrets):**
```bash
wrangler secret put BIGQUERY_PROJECT_ID
wrangler secret put BIGQUERY_CREDENTIALS
wrangler secret put EVENT_SIGNING_SECRET
wrangler secret put ALLOWED_ORIGINS
```

### Wrangler.toml

```toml
name = "outbound-intent-engine"
main = "src/worker/index.ts"
compatibility_date = "2024-01-01"

# Development
[env.staging]
vars = { ENVIRONMENT = "staging" }

# Production
[env.production]
vars = { ENVIRONMENT = "production" }
```

---

## 🧹 Code Style

### TypeScript

- Use strict mode
- Prefer `const` over `let`
- Use async/await over promises
- Type all function parameters
- Avoid `any` type

### Naming Conventions

- **Files:** `kebab-case.ts`
- **Classes:** `PascalCase`
- **Functions:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Interfaces:** `PascalCase` (no `I` prefix)

### Example

```typescript
// Good
interface TrackingEvent {
  type: string;
  timestamp: number;
}

class EventTracker {
  private readonly endpoint: string;
  
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }
  
  async trackEvent(event: TrackingEvent): Promise<void> {
    // Implementation
  }
}

// Bad
interface IEvent {
  Type: string;
  timestamp: any;
}

class event_tracker {
  Endpoint: string;
  
  TrackEvent(event: any) {
    // No return type
  }
}
```

---

## 📊 Performance Monitoring

### Pixel Performance

```javascript
// Measure script load time
const start = performance.now();
// ... pixel loads ...
const end = performance.now();
console.log(`Pixel loaded in ${end - start}ms`);
```

### Worker Performance

```bash
# Monitor with wrangler
wrangler tail --format json | jq '.outcome, .logs'

# Check analytics in dashboard
# Workers & Pages → Your Worker → Analytics
```

### BigQuery Costs

```sql
-- Check query costs (last 30 days)
SELECT
  user_email,
  SUM(total_bytes_processed) / POW(10, 12) as TB_processed,
  SUM(total_bytes_processed) / POW(10, 12) * 5 as estimated_cost_usd
FROM `region-us`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY user_email
ORDER BY TB_processed DESC;
```

---

## 🚀 Release Process

### 1. Version Bump

```bash
npm version patch  # 1.0.0 → 1.0.1
# or
npm version minor  # 1.0.0 → 1.1.0
```

### 2. Build

```bash
npm run build:pixel
```

### 3. Test

```bash
# Manual testing
npm run dev:pixel
npm run dev:worker

# Load test (optional)
# Use k6, artillery, or similar
```

### 4. Deploy

```bash
# Worker
npm run deploy:worker

# Pixel to CDN
npm run deploy:pixel
```

### 5. Tag Release

```bash
git tag -a v1.0.1 -m "Release 1.0.1"
git push origin v1.0.1
```

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make changes
4. Test thoroughly
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open Pull Request

---

## 📚 Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers)
- [BigQuery API Reference](https://cloud.google.com/bigquery/docs/reference)
- [Vite Guide](https://vitejs.dev/guide/)

---

**Happy coding!** 🎉

