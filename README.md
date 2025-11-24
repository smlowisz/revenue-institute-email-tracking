# 🎯 Outbound Intent Engine

**Track visitor behavior from cold outreach → Build custom intent scores**

[![Status](https://img.shields.io/badge/status-live-success)](https://intel.revenueinstitute.com/health)
[![Leads](https://img.shields.io/badge/leads-1M%2B_tracked-blue)](#)
[![Personalization](https://img.shields.io/badge/personalization-%3C10ms-brightgreen)](#)

---

## ⚡ System Status

**🟢 LIVE and operational**

- **Worker:** https://intel.revenueinstitute.com
- **Tracking:** Active via GTM
- **Leads ready:** 1,093,184 with tracking IDs
- **Personalization:** 9,904 leads in KV (<10ms)
- **Auto-sync:** Hourly updates configured

---

## 🚀 Quick Start

### **1. Send Email Campaigns**

Use tracking parameter in ANY URL:
```
https://revenueinstitute.com/demo?i={{trackingId}}
https://revenueinstitute.com/pricing?i={{trackingId}}
https://revenueinstitute.com/any-page?i={{trackingId}}
```

**Parameter:** `i` (identity)  
**Your leads table has:** `trackingId` column with unique IDs

### **2. View Tracking Data**

**BigQuery Console:** https://console.cloud.google.com/bigquery?project=n8n-revenueinstitute

```sql
-- See all recent activity
SELECT type, visitorId, url, city, asOrganization
FROM `n8n-revenueinstitute.outbound_sales.events`
WHERE _insertedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
ORDER BY timestamp DESC;

-- See multi-visitor companies
SELECT * FROM `n8n-revenueinstitute.outbound_sales.company_activity`
WHERE hasMultipleVisitors = TRUE;

-- See return visit patterns
SELECT * FROM `n8n-revenueinstitute.outbound_sales.visitor_return_patterns`
ORDER BY totalVisitDays DESC;
```

### **3. Use Personalization**

**24 fields available:**
- firstName, lastName, email, phone
- company, companySize, revenue, industry
- jobTitle, seniority, department
- And more... see [PERSONALIZATION_FIELDS.md](PERSONALIZATION_FIELDS.md)

**Example HTML:**
```html
<h1>Welcome, <span data-personalize="firstName">there</span>!</h1>
<p>Solutions for <span data-personalize="companyName">your company</span></p>
<p>Perfect for <span data-personalize="industry">your industry</span></p>
```

---

## 📊 What's Being Tracked

### **Events Captured:**
- Pageviews, Clicks, Scrolls, Forms, Videos
- Focus changes, Page exits, Copy/paste
- Device switching, Return visits

### **Data Per Event (100+ fields):**
- Full URL + all UTM parameters
- Referrer + auto-detected channel
- Button/link ID, class, text
- IP, city, region, ISP, timezone
- Device fingerprint, browser ID
- Visit count, reading time, scroll depth
- Company identifier (multi-visitor detection)
- Email hashes (SHA-256, SHA-1, MD5)

**Complete reference:** [DATA_DICTIONARY.md](DATA_DICTIONARY.md)

---

## 🗄️ Database Structure

**Tables (6):**
1. `events` - Raw event stream
2. `sessions` - Aggregated sessions
3. `lead_profiles` - Visitor profiles
4. `identity_map` - Tracking ID lookups
5. `email_clicks` - Click tracking
6. `leads` - Your 1M+ leads

**Views (9):**
1. `company_activity` - Multi-visitor companies
2. `visitor_return_patterns` - Return analysis
3. `content_depth` - Engagement quality
4. `multi_device_visitors` - Device switching
5. `backtracking_visitors` - Navigation patterns
6. Plus 4 more analytical views

---

## 🔄 Automated KV Sync

**Schedule:** Every hour (via GitHub Actions)

**Updates:**
- ✅ New leads added to database
- ✅ Behavioral scores (return visits, pages viewed)
- ✅ Device fingerprints (multi-device tracking)
- ✅ Engagement levels (cold/warm/hot)

**No manual work needed!** See: [docs/technical/AUTOMATED_KV_SYNC.md](docs/technical/AUTOMATED_KV_SYNC.md)

---

## 📚 Documentation

### **Root Files (Essential):**
- **README.md** - This file (overview)
- **[PERSONALIZATION_FIELDS.md](PERSONALIZATION_FIELDS.md)** - All 24 personalization fields
- **[DATA_DICTIONARY.md](DATA_DICTIONARY.md)** - Complete data reference

### **Organized Docs:**
- **[docs/guides/](docs/guides/)** - Beginner setup guides (Cloudflare, BigQuery, GitHub)
- **[docs/technical/](docs/technical/)** - Technical docs (Architecture, Deployment, Dev guide)
- **[docs/qa/](docs/qa/)** - QA reports & system status

---

## 🎯 Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Client | JavaScript (15 KB) | Event capture |
| Edge | Cloudflare Workers | Event routing |
| Cache | Cloudflare KV | Personalization (<10ms) |
| Warehouse | BigQuery | Analytics & scoring |
| Integration | Google Tag Manager | Easy deployment |

---

## 💰 Cost

**Current scale (1M leads, moderate traffic):**
- Cloudflare Workers: $0-5/month
- Cloudflare KV: $0 (free tier)
- BigQuery: $0-10/month
- GitHub Actions: $0 (free tier)

**Total: ~$0-15/month** 💰

---

## 🚀 Next Steps

1. ✅ **System is ready** - Everything deployed
2. ⏳ **Hard reload site** - Get latest pixel (Cmd+Shift+R)
3. ✅ **Start campaigns** - Use `?i={{trackingId}}` in emails
4. ✅ **Query data** - Build your custom scoring
5. ✅ **Personalize** - Use data attributes on pages

---

## 🆘 Quick Links

- **Worker Health:** https://intel.revenueinstitute.com/health
- **BigQuery Console:** https://console.cloud.google.com/bigquery?project=n8n-revenueinstitute
- **Cloudflare Dashboard:** https://dash.cloudflare.com
- **GitHub Actions:** https://github.com/smlowisz/revenue-institute-email-tracking/actions

---

## 📞 Support

See detailed guides in `docs/` folder:
- Setup issues → `docs/guides/`
- Technical questions → `docs/technical/`
- System status → `docs/qa/`

---

**Built for Revenue Institute** | Last updated: November 24, 2025
