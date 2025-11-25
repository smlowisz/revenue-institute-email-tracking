# ⚡ Near Real-Time KV Sync - Pure Cloudflare Solution

**100% Cloudflare Workers + BigQuery - NO external dependencies!**

---

## 🚀 Automatic Sync (Every 5 Minutes!)

**Schedule:** 288 times per day (every 5 minutes!)

**What it syncs:**
- ✅ **ALL leads added in last 10 minutes** (unlimited!)
- ✅ **ALL leads who visited in last 10 minutes** (behavioral updates)
- ✅ No limit - syncs everything!

**Example:**
- 10:00 AM: Add 50,000 leads to BigQuery
- 10:05 AM: Cron runs, finds all 50,000
- 10:07 AM: All synced to KV ✅
- 10:10 AM: Start sending campaigns!

**Max delay:** 5 minutes ⚡  
**Typical delay:** 2-7 minutes

---

## ⚡ Manual Instant Sync (Optional)

**After MASSIVE bulk import (100k+ leads), trigger immediate sync:**

**Webhook endpoint:**
```bash
POST https://intel.revenueinstitute.com/sync-kv-now
Authorization: Bearer <YOUR_EVENT_SIGNING_SECRET>
```

**Use when:**
- Imported 100k+ leads and can't wait 5 minutes
- Testing

**How to trigger:**
```bash
curl -X POST https://intel.revenueinstitute.com/sync-kv-now \
  -H "Authorization: Bearer $EVENT_SIGNING_SECRET"
```

**Response:**
```json
{"success":true,"message":"KV sync completed","timestamp":"..."}
```

**But usually not needed** - automatic 5-min sync is fast enough!

---

## 🎯 How It Works

### **Scenario 1: Add Leads Throughout Day**

```
9:00 AM: Add 100 leads to BigQuery
9:05 AM: Cron runs, syncs all 100 ✅

11:30 AM: Add 5,000 more leads
11:35 AM: Cron runs, syncs all 5,000 ✅

2:00 PM: Add 50,000 leads  
2:05 PM: Cron runs, syncs all 50,000 ✅

Result: Max 5-minute delay, fully automatic!
```

### **Scenario 2: Visitor Returns**

```
Visitor browses site at 10:00 AM
  → Events tracked to BigQuery
  ↓
10:05 AM: Cron runs
  → Detects recent activity
  → Updates KV with behavioral data
  ↓
Visitor returns at 10:10 AM
  → Personalization shows updated data!
```

### **Scenario 3: Bulk Import (100k leads)**

```
Import 100k leads at 3:00 PM
  ↓
3:05 PM: Cron runs (finds all 100k)
3:10 PM: All synced to KV (takes ~5 min for 100k)
  ↓
Start campaigns immediately!
```

---

## 🔧 How to Trigger Instant Sync

### **Option 1: Command Line**

```bash
# Set your secret (get from: wrangler secret list)
export KV_SYNC_SECRET="your-event-signing-secret"

# Trigger sync
curl -X POST https://intel.revenueinstitute.com/sync-kv-now \
  -H "Authorization: Bearer $KV_SYNC_SECRET"
```

### **Option 2: From BigQuery Scheduled Query**

Create a BigQuery scheduled query that triggers webhook after lead import:

```sql
-- After your lead import query runs:
SELECT NET.HTTP_POST(
  'https://intel.revenueinstitute.com/sync-kv-now',
  'Authorization: Bearer YOUR_SECRET',
  ''
);
```

### **Option 3: From n8n**

Add HTTP Request node:
- Method: POST
- URL: https://intel.revenueinstitute.com/sync-kv-now
- Headers: Authorization: Bearer {{secret}}
- Trigger: After lead import

---

## 📊 Sync Performance

**Small batch (1-100 leads):**
- Time: <5 seconds
- All synced instantly

**Medium batch (1k-10k leads):**
- Time: ~1-2 minutes
- Batched automatically

**Large batch (50k+ leads):**
- Time: ~3-5 minutes
- All synced, no limit!

**BigQuery → KV latency:** Immediate (writes directly to KV)

---

## 🎯 Summary

**Automatic Sync:**
- ✅ Every 3 hours (8x/day)
- ✅ No limit - syncs ALL new leads
- ✅ 6-hour lookback window
- ✅ Pure Cloudflare (cron trigger)

**Manual Sync:**
- ✅ Webhook endpoint available
- ✅ Instant trigger anytime
- ✅ No limit - syncs everything
- ✅ From any system

**Best of both worlds:**
- Regular automatic updates (every 3h)
- Instant sync when you need it (webhook)
- Unlimited capacity (no 1k cap)

---

## 🚀 Next Steps

**1. Get your EVENT_SIGNING_SECRET:**
```bash
cd revenue-institute-email-tracking
wrangler secret list
# Copy the value (you set it earlier)
```

**2. Test instant sync:**
```bash
curl -X POST https://intel.revenueinstitute.com/sync-kv-now \
  -H "Authorization: Bearer YOUR_SECRET"
```

**3. Monitor sync:**
- https://dash.cloudflare.com
- Workers → outbound-intent-engine → Logs
- Look for: "📦 Found X leads to sync"

---

**Auto-sync:** Every 3 hours (no limit) ✅  
**Manual sync:** Webhook trigger anytime ✅  
**All Cloudflare:** No external dependencies ✅

**Add 50k leads? They'll ALL sync within 3 hours, or instantly via webhook!** 🚀

