# Outbound Intent Engine - Architecture

Technical architecture and implementation details.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VISITOR JOURNEY                          │
└─────────────────────────────────────────────────────────────────┘

1. Email Click → 2. Tracking Pixel → 3. Event Stream → 4. BigQuery → 5. Insights

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Cold Email  │───▶│   Website    │───▶│  Cloudflare  │───▶│   BigQuery   │
│  (Smartlead) │    │  + Pixel.js  │    │    Worker    │    │  (Warehouse) │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
      │                    │                    │                    │
      │                    │                    │                    │
      ▼                    ▼                    ▼                    ▼
   ?i=ab3f9         Track Events        Enrich + Store       Scoring + Views
                    (pageview,          (IP, geo,            (Intent score,
                     scroll,             timestamp)           aggregation)
                     clicks)                                        │
                                                                    │
                                                                    ▼
                                              ┌──────────────────────────────┐
                                              │     Cloudflare KV            │
                                              │  (Personalization Cache)     │
                                              └──────────────────────────────┘
                                                          │
                                                          ▼
                                              ┌──────────────────────────────┐
                                              │    CRM / n8n / Alerts        │
                                              │  (Salesforce, HubSpot, etc.) │
                                              └──────────────────────────────┘
```

---

## 🔧 Component Details

### 1. Tracking Pixel (`src/pixel/index.ts`)

**Purpose:** Client-side JavaScript tracker for capturing visitor behavior.

**Technical Specs:**
- Size: <12KB minified
- Target: ES2015+ browsers
- Zero blocking JavaScript (async loaded)
- Uses `navigator.sendBeacon` for reliability

**Key Features:**
- Identity extraction from URL parameter (`?i=xxx`)
- Persistent storage (localStorage + cookies, 90-day TTL)
- Session management (30-min timeout)
- Event batching (5 events or 10 seconds)
- Automatic page unload handling

**Events Tracked:**
| Event Type | Trigger | Data Captured |
|------------|---------|---------------|
| `pageview` | Page load | URL, referrer, viewport, device |
| `scroll_depth` | Scroll milestones | 25%, 50%, 75%, 90%, 100% |
| `click` | Button/link clicks | Element ID, class, text, href |
| `form_start` | Field focus | Form ID, field name |
| `form_submit` | Form submission | Field names, hashed emails |
| `video_play` | Video interaction | Source, progress % |
| `focus_lost` | Tab blur | Timestamp |
| `page_exit` | Before unload | Active time, scroll depth |

**Storage Schema:**
```typescript
// localStorage: _oie_visitor
{
  visitorId: string,
  timestamp: number
}

// Cookie: _oie_vid (90 days, Secure, SameSite=Lax)
value: string (visitorId)
```

---

### 2. Cloudflare Worker (`src/worker/index.ts`)

**Purpose:** Edge-based event ingestion, enrichment, and routing.

**Technical Specs:**
- Runtime: Cloudflare Workers (V8 isolates)
- Execution: <50ms p99
- Concurrency: 10,000+ simultaneous requests
- Cost: ~$5/month for 10M requests

**Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/track` | POST | Receive event batches |
| `/identify` | GET | Lookup short ID → identity |
| `/personalize` | GET | Fetch visitor personalization data |
| `/go` | GET | Redirect + track click |
| `/health` | GET | Health check |

**Request Flow:**

```javascript
// POST /track
{
  events: [
    {
      type: "pageview",
      timestamp: 1234567890,
      sessionId: "abc-123",
      visitorId: "ab3f9",
      url: "https://domain.com/pricing",
      referrer: "https://google.com",
      data: { /* event-specific data */ }
    }
  ],
  meta: { sentAt: 1234567890 }
}

// Response (immediate)
{ success: true, eventsReceived: 1 }
```

**Server-Side Enrichment:**
```javascript
{
  ...clientEvent,
  serverTimestamp: Date.now(),
  ip: request.headers.get('CF-Connecting-IP'),
  country: request.headers.get('CF-IPCountry'),
  colo: request.cf.colo,  // Cloudflare datacenter
  asn: request.cf.asn,    // Autonomous System Number
  city: request.cf.city,
  timezone: request.cf.timezone
}
```

**BigQuery Integration:**

Uses service account JWT authentication:
1. Generate JWT token from GCP service account key
2. Exchange for OAuth2 access token
3. POST to BigQuery streaming insert API
4. Async operation (doesn't block response)

**Security:**
- CORS validation (allowed origins only)
- Rate limiting (Cloudflare built-in)
- Event signing (optional, using `EVENT_SIGNING_SECRET`)
- Origin validation on all POST requests

---

### 3. BigQuery Schema (`bigquery/schema.sql`)

**Purpose:** Data warehouse for all tracking data, scoring, and analytics.

**Tables:**

#### `events` (Raw Events)
- **Partitioned by:** `DATE(timestamp)`
- **Clustered by:** `visitorId`, `sessionId`, `type`
- **Retention:** 730 days
- **Average size:** ~500 bytes/event
- **Monthly volume:** ~100M events = ~50GB

**Schema:**
```sql
type STRING            -- Event type (pageview, click, etc.)
timestamp INT64        -- Client timestamp (millis)
serverTimestamp INT64  -- Server timestamp (millis)
sessionId STRING       -- Session identifier
visitorId STRING       -- Visitor identifier (nullable)
url STRING             -- Page URL
referrer STRING        -- HTTP referrer
data JSON              -- Event-specific data
ip STRING              -- Client IP
country STRING         -- ISO country code
userAgent STRING       -- Browser user agent
[... Cloudflare enrichment fields ...]
```

#### `sessions` (Aggregated Sessions)
- **Partitioned by:** `DATE(startTime)`
- **Clustered by:** `visitorId`, `sessionId`
- **Purpose:** Pre-aggregated session metrics

**Key Fields:**
- `sessionId`, `visitorId`
- `startTime`, `endTime`, `duration`, `activeTime`
- `pageviews`, `clicks`, `maxScrollDepth`
- `formsStarted`, `formsSubmitted`, `videosWatched`
- `engagementScore` (0-100)
- `viewedPricing`, `viewedCaseStudies`, `viewedProduct`

#### `lead_profiles` (Visitor Profiles)
- **Clustered by:** `visitorId`, `intentScore`
- **Purpose:** Identity, attribution, scoring

**Key Fields:**
- Identity: `visitorId`, `email`, `firstName`, `lastName`, `company`
- Attribution: `campaignId`, `campaignName`, `firstClickAt`
- Behavior: `totalSessions`, `totalPageviews`, `lastVisitAt`
- Scoring: `intentScore` (0-100), `engagementLevel` (cold/warm/hot/burning)
- High-intent signals: `pricingPageVisits`, `formSubmissions`, etc.
- CRM: `syncedToCRM`, `crmContactId`, `lastSyncedAt`

#### `identity_map` (Tracking ID → Identity)
- **Clustered by:** `shortId`, `visitorId`
- **Purpose:** Resolve short tracking IDs

#### `email_clicks` (Click Tracking)
- **Partitioned by:** `DATE(clickedAt)`
- **Purpose:** Track email link clicks

---

### 4. Intent Scoring Algorithm (`bigquery/scoring-queries.sql`)

**Formula:**

```
intentScore = min(100, (
  Recency (0-30 points) +
  Frequency (0-20 points) +
  Engagement (0-25 points) +
  High-Intent Pages (0-25 points) +
  Conversions (0-20 points)
))
```

**Breakdown:**

**Recency (0-30 points):**
- Last 24 hours: 30 pts
- Last 3 days: 25 pts
- Last 7 days: 20 pts
- Last 14 days: 15 pts
- Last 30 days: 10 pts
- Older: 5 pts

**Frequency (0-20 points):**
- Sessions × 4 (capped at 20)
- Rewards multiple visits

**Engagement (0-25 points):**
- Pageviews × 1.5
- Active time (seconds) / 60
- Scroll depth milestones

**High-Intent Pages (0-25 points):**
- Pricing page visit: 8 pts each
- Case study view: 5 pts each
- Product page: 4 pts each

**Conversions (0-20 points):**
- Form submission: 15 pts each
- Video completion: 5 pts each

**Engagement Levels:**
```
intentScore >= 80  → "burning" 🔥🔥🔥
intentScore >= 60  → "hot"     🔥🔥
intentScore >= 40  → "warm"    🔥
intentScore < 40   → "cold"    ❄️
```

---

### 5. Scheduled Queries (Data Pipeline)

**Query 1: Event → Session Aggregation**
- **Frequency:** Every 5 minutes
- **Purpose:** Roll up raw events into session records
- **Operation:** MERGE (upsert) into `sessions` table
- **Cost:** ~$0.01 per run

**Query 2: Session → Lead Profile Update**
- **Frequency:** Every 15 minutes
- **Purpose:** Update lead profiles with latest behavior + scoring
- **Operation:** MERGE into `lead_profiles` table
- **Cost:** ~$0.05 per run

**Query 3: KV Sync (Personalization)**
- **Frequency:** Every 1 hour
- **Purpose:** Export high-intent leads for personalization
- **Destination:** Cloud Storage → Cloud Function → KV
- **Cost:** ~$0.10 per run

**Query 4: Hot Lead Alerts**
- **Frequency:** Every 15 minutes
- **Purpose:** Detect newly hot leads for CRM sync
- **Destination:** Pub/Sub topic → n8n/Zapier
- **Cost:** ~$0.02 per run

**Total Pipeline Cost:** ~$150/month at 10M events/day

---

### 6. Cloudflare KV (`IDENTITY_STORE`, `PERSONALIZATION`)

**Purpose:** Sub-10ms lookups at the edge for identity + personalization.

**IDENTITY_STORE:**
```javascript
// Key: shortId (e.g., "ab3f9")
{
  shortId: "ab3f9",
  visitorId: null,  // Assigned on first visit
  email: "john@acme.com",
  firstName: "John",
  lastName: "Doe",
  company: "Acme Corp",
  campaignId: "q1-2024-outbound",
  campaignName: "Q1 2024 Outbound",
  createdAt: 1234567890,
  expiresAt: 1234567890
}
```

**PERSONALIZATION:**
```javascript
// Key: visitorId
{
  firstName: "John",
  company: "Acme Corp",
  intentScore: 85,
  engagementLevel: "burning",
  viewedPricing: true,
  submittedForm: false
}
```

**Sync Strategy:**
1. BigQuery scheduled query runs hourly
2. Exports high-intent leads to Cloud Storage
3. Cloud Function triggers on new file
4. Function bulk-writes to KV via API
5. KV data available globally in <10ms

---

## 🔄 Data Flow

### 1. Visitor Click Flow

```
1. Recipient clicks: https://domain.com/go?i=ab3f9&to=/demo
2. Worker /go endpoint:
   - Logs click event
   - Looks up identity in KV
   - Redirects to: https://domain.com/demo?i=ab3f9
3. Pixel on landing page:
   - Extracts i=ab3f9 from URL
   - Saves to localStorage + cookie
   - Tracks pageview event
```

### 2. Event Tracking Flow

```
1. User scrolls page
2. Pixel detects scroll (debounced 150ms)
3. Batches event in queue
4. After 5 events OR 10 seconds:
   - POST to /track endpoint
5. Worker receives batch:
   - Validates origin
   - Enriches with server data
   - Returns 200 OK immediately
6. Worker async:
   - Authenticates with BigQuery
   - Streams insert to events table
7. BigQuery:
   - Stores in streaming buffer
   - Available in ~1-2 minutes
```

### 3. Scoring Flow

```
1. Events arrive in BigQuery
2. Every 5 min: Aggregate events → sessions
3. Every 15 min: Update lead profiles + calculate intent score
4. Every hour: Export high-intent leads → KV
5. Real-time: Pixel fetches personalization data from KV
```

---

## 📊 Performance Characteristics

| Component | Latency | Throughput | Cost |
|-----------|---------|------------|------|
| Tracking Pixel | <5ms page impact | N/A | Free |
| Worker /track | <50ms p99 | 10k+ RPS | $5/10M req |
| Worker /personalize | <10ms p99 | 10k+ RPS | $5/10M req |
| BigQuery insert | 1-2 min buffer | 100k+ rows/sec | $5/TB |
| BigQuery query | 1-5 sec | 1TB/sec | $5/TB scanned |
| KV read | <10ms p99 | Unlimited | $0.50/1M reads |

---

## 🔐 Privacy & Compliance

**GDPR Considerations:**
- ✅ First-party cookies (not third-party)
- ✅ Email hashing (SHA256) for PII protection
- ✅ 90-day identity expiration
- ✅ No cross-site tracking
- ⚠️ Consider cookie consent banner
- ⚠️ Provide data deletion endpoint

**Data Retention:**
- Events: 2 years (partitioned, automatic expiration)
- Sessions: No expiration (aggregated, no PII)
- Lead profiles: Manual cleanup required
- Identity map: 90-day TTL

---

## 🚀 Scaling Considerations

**At 100M events/day:**
- Worker cost: ~$50/month
- BigQuery storage: ~500GB/year = $10/month
- BigQuery queries: ~$500/month (depends on usage)
- KV operations: ~$50/month
- **Total: ~$600/month**

**Optimizations for scale:**
1. Use BigQuery materialized views for hot queries
2. Batch KV writes (1000 keys per call)
3. Implement event sampling for non-critical events
4. Use Cloudflare Durable Objects for real-time aggregation
5. Consider ClickHouse for sub-second analytics

---

## 🧪 Testing Strategy

**Unit Tests:**
- Pixel event generation
- Worker endpoint logic
- Identity generation

**Integration Tests:**
- End-to-end event flow
- BigQuery insertion
- KV sync

**Load Tests:**
- Worker: 10k RPS sustained
- BigQuery: 100k events/minute
- Pixel: Page load impact <5ms

---

## 📚 Tech Stack Summary

| Layer | Technology | Why |
|-------|------------|-----|
| Client | JavaScript (ES2015) | Universal browser support |
| Edge | Cloudflare Workers | <50ms global latency |
| Storage | Cloudflare KV | Sub-10ms reads at edge |
| Warehouse | BigQuery | Infinite scale, SQL analytics |
| Build | Vite + TypeScript | Fast builds, type safety |
| Deployment | Wrangler CLI | Simple CF deploys |

---

## 🔮 Future Enhancements

- [ ] Real-time WebSocket streaming for live dashboards
- [ ] Machine learning intent prediction models
- [ ] A/B testing framework
- [ ] Heatmap generation
- [ ] Session replay (privacy-safe)
- [ ] Multi-touch attribution
- [ ] Predictive lead scoring with AI

---

**Questions?** See `DEPLOYMENT.md` for setup or open an issue.

