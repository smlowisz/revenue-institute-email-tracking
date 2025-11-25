# 🔄 Better KV Sync Solution - n8n Workflow

**Much simpler than GitHub Actions!**

---

## 🎯 Best Option: n8n (You Already Have It!)

Since your project is `n8n-revenueinstitute`, you already have n8n running!

### **Setup (5 minutes in n8n):**

**1. Import Workflow**
- Open n8n
- Import `n8n-kv-sync-workflow.json`
- Or create manually (4 nodes)

**2. Workflow Nodes:**

```
Schedule (Every Hour)
    ↓
BigQuery Node
  Query: Get new/active leads (last 24h)
    ↓
Code Node
  Transform to KV format with all personalization fields
    ↓
HTTP Request Node
  POST to Cloudflare KV bulk API
```

**3. Configure:**
- BigQuery: Already connected in your n8n
- Cloudflare API Token: `b2eUcOm0HJSnK2G-DQQbSzUmjQLL34J20ZQxo1o_`
- Schedule: Every 1 hour (adjustable)

**4. Activate!**

---

## 💡 Why n8n is Better

### **vs GitHub Actions:**
- ✅ Visual workflow (easy to modify)
- ✅ Already running (no new infrastructure)
- ✅ Easy to debug (see logs in UI)
- ✅ Can add transformations easily
- ✅ No authentication issues

### **vs Cron Job:**
- ✅ No server needed
- ✅ Visual monitoring
- ✅ Error handling built-in
- ✅ Can pause/resume easily

---

## 🚀 Alternative: Simple Cron Job

**If you don't want to use n8n:**

**1. Create cron job on any server:**

```bash
# Add to crontab (crontab -e)
0 * * * * cd /path/to/project && /usr/local/bin/npm run sync-personalization >> /var/log/kv-sync.log 2>&1
```

**2. Or use macOS launchd:**

Create `~/Library/LaunchAgents/com.revenueinstitute.kv-sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.revenueinstitute.kv-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cd "/Users/stephenlowisz/Documents/Github-Cursor/Revenue Institute/revenue-institute-email-tracking" && export CLOUDFLARE_API_TOKEN="b2eUcOm0HJSnK2G-DQQbSzUmjQLL34J20ZQxo1o_" && export GOOGLE_APPLICATION_CREDENTIALS="/Users/stephenlowisz/Downloads/n8n-revenueinstitute-8515f5f24ec2.json" && npm run sync-personalization</string>
    </array>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>StandardOutPath</key>
    <string>/tmp/kv-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/kv-sync-error.log</string>
</dict>
</plist>
```

Then: `launchctl load ~/Library/LaunchAgents/com.revenueinstitute.kv-sync.plist`

---

## 💡 BEST Option: n8n Workflow

**Advantages:**
1. ✅ You already have n8n running
2. ✅ Visual - easy to see what's happening
3. ✅ Can add conditions (only sync if >10 new leads)
4. ✅ Error notifications built-in
5. ✅ Can trigger manually anytime
6. ✅ Can add pre/post processing

**Setup:** Import the JSON file into n8n, activate!

---

## 🎯 My Recommendation

**Use n8n** - You already have it, it's visual, and it's perfect for this!

**The workflow:**
1. Runs every hour (or whatever schedule you want)
2. Queries BigQuery for new/recently active leads
3. Transforms to personalization JSON
4. Bulk uploads to Cloudflare KV
5. Done!

**Want me to help you set it up in n8n?** Or prefer cron job?

---

## 📊 KV Sync Strategy

**Only sync:**
- New leads (last 24 hours)
- Recently active visitors (visited in last 24h)
- This keeps it fast (~1,000 leads/day vs 1M all at once)

**Result:**
- Active leads always in KV ✅
- Inactive leads expire naturally (90 days)
- KV stays small and fast ✅
- Sync completes in <1 minute ✅

---

**Which do you prefer: n8n or cron job?**

