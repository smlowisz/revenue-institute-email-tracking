# Complete Data Dictionary - All Fields Captured

**All data for YOUR scoring - no automatic scoring included**

---

## 📊 Core Event Data (Every Event)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `type` | STRING | Event type | pageview, click, scroll_depth |
| `timestamp` | INT64 | Client timestamp (ms) | 1763991234567 |
| `serverTimestamp` | INT64 | Server timestamp (ms) | 1763991234890 |
| `sessionId` | STRING | Session identifier | 1763991234-abc123 |
| `visitorId` | STRING | Tracking ID (NULL if anonymous) | abc123 or NULL |
| `url` | STRING | Full page URL | https://revenueinstitute.com/pricing?utm_source=email |
| `referrer` | STRING | HTTP referrer | https://google.com/search |

---

## 🎯 Visit & Return Tracking

**Captured in pageview events:**

| Field | Type | Description | Use For Scoring |
|-------|------|-------------|-----------------|
| `visitNumber` | INT | 1, 2, 3, ... | Return visitor indicator |
| `isFirstVisit` | BOOL | true/false | New vs returning |
| `isReturnVisitor` | BOOL | true/false | Engagement signal |
| `previousPage` | STRING | Last page in session | Navigation pattern |
| `isBacktracking` | BOOL | Went to previously visited page | Comparison/hesitation (#18) |

**Query to count visits per visitor:**
```sql
SELECT 
  visitorId,
  MAX(CAST(JSON_EXTRACT_SCALAR(data, '$.visitNumber') AS INT64)) as total_visits
FROM outbound_sales.events
WHERE type = 'pageview' AND visitorId IS NOT NULL
GROUP BY visitorId;
```

---

## 🏢 Company Detection (No External APIs)

**Server-side enrichment:**

| Field | Type | Description | Use For Scoring |
|-------|------|-------------|-----------------|
| `companyIdentifier` | STRING | Hashed IP subnet | Group visitors from same company |
| `asOrganization` | STRING | ISP/Company from ASN | "Google Fiber", "Comcast", etc. |
| `asn` | INT64 | Autonomous System Number | Network identifier |

**Query to find multiple visitors from same company:**
```sql
SELECT 
  companyIdentifier,
  asOrganization,
  city,
  COUNT(DISTINCT visitorId) FILTER (WHERE visitorId IS NOT NULL) as identified_visitors,
  COUNT(DISTINCT sessionId) as total_sessions,
  ARRAY_AGG(DISTINCT visitorId IGNORE NULLS) as visitor_list
FROM outbound_sales.events
WHERE companyIdentifier IS NOT NULL
GROUP BY companyIdentifier, asOrganization, city
HAVING COUNT(DISTINCT visitorId) FILTER (WHERE visitorId IS NOT NULL) > 1
ORDER BY identified_visitors DESC;
```

---

## 🔄 Cross-Device & Cross-Browser Tracking

**Captured in all events:**

| Field | Type | Description | Use For Scoring |
|-------|------|-------------|-----------------|
| `deviceFingerprint` | STRING | Device ID hash | Same person, different devices |
| `browserId` | STRING | Persistent browser ID | Cross-tab tracking |
| `platform` | STRING | MacIntel, Win32, iPhone | Device switching (#19) |
| `userAgent` | STRING | Full UA string | Device details |

**Captured in device_switched event:**
| Field | Description |
|-------|-------------|
| `previousDeviceCount` | How many devices before this one |
| `newDevice` | New device fingerprint |
| `allDevices` | Array of all devices used |

**Query for device switchers:**
```sql
SELECT * FROM outbound_sales.multi_device_visitors
WHERE uniqueDevices > 1
ORDER BY uniqueDevices DESC;
```

---

## 📖 Reading Quality Metrics (#3)

**Captured in page_exit event:**

| Field | Type | Description | Use For Scoring |
|-------|------|-------------|-----------------|
| `readingTime` | INT | Seconds spent reading (slow scroll/stationary) | Engagement quality |
| `scanningTime` | INT | Seconds fast scrolling | Skimming indicator |
| `readingRatio` | FLOAT | readingTime / totalTime | Quality metric |
| `engagementQuality` | STRING | 'high' or 'low' | Pre-categorized |
| `totalTime` | INT | Total seconds on page | Duration |
| `activeTime` | INT | Seconds actively engaged | Attention |

**Query to find deep readers:**
```sql
SELECT 
  visitorId,
  sessionId,
  url,
  CAST(JSON_EXTRACT_SCALAR(data, '$.readingTime') AS INT64) as reading_time,
  CAST(JSON_EXTRACT_SCALAR(data, '$.scanningTime') AS INT64) as scanning_time,
  CAST(JSON_EXTRACT_SCALAR(data, '$.readingRatio') AS FLOAT64) as reading_quality
FROM outbound_sales.events
WHERE type = 'page_exit'
  AND CAST(JSON_EXTRACT_SCALAR(data, '$.readingTime') AS INT64) > 60  -- Read for >1 min
ORDER BY reading_time DESC;
```

---

## 📚 Content Depth Signals (#5)

**Captured in page_exit event:**

| Field | Type | Description | Use For Scoring |
|-------|------|-------------|-----------------|
| `pagesThisSession` | INT | Total pages in session | Depth of research |
| `timePerPage` | INT | Average seconds per page | Engagement per page |
| `maxScrollDepth` | INT | Deepest scroll % | How far they went |

**Query for deep researchers:**
```sql
SELECT 
  visitorId,
  sessionId,
  CAST(JSON_EXTRACT_SCALAR(data, '$.pagesThisSession') AS INT64) as pages_visited,
  CAST(JSON_EXTRACT_SCALAR(data, '$.timePerPage') AS INT64) as avg_time_per_page
FROM outbound_sales.events
WHERE type = 'page_exit'
  AND CAST(JSON_EXTRACT_SCALAR(data, '$.pagesThisSession') AS INT64) >= 5
ORDER BY pages_visited DESC;
```

---

## 🔄 Backtracking Behavior (#18)

**Captured in pageview events:**

| Field | Type | Description | Use For Scoring |
|-------|------|-------------|-----------------|
| `previousPage` | STRING | Last page visited | Navigation pattern |
| `isBacktracking` | BOOL | Returned to earlier page | Comparison mode |

**Query for backtracking visitors:**
```sql
SELECT * FROM outbound_sales.backtracking_visitors
WHERE backtrackRatio > 0.3  -- >30% of pageviews are revisits
ORDER BY backtrackCount DESC;
```

---

## 🕒 Time-Based Signals (#20)

**Captured in pageview events:**

| Field | Type | Description | Use For Scoring |
|-------|------|-------------|-----------------|
| `localHour` | INT | 0-23 | Time of day |
| `localDayOfWeek` | INT | 0-6 (0=Sunday) | Day of week |
| `isWeekend` | BOOL | true/false | Weekend research |
| `isBusinessHours` | BOOL | true/false | Mon-Fri 9am-5pm local |
| `timezone` | STRING | America/New_York | User timezone |

**Query for off-hours researchers:**
```sql
SELECT 
  visitorId,
  COUNT(*) as weekend_or_afterhours_visits,
  ARRAY_AGG(DISTINCT JSON_EXTRACT_SCALAR(data, '$.localHour')) as hours_active
FROM outbound_sales.events
WHERE type = 'pageview'
  AND (
    CAST(JSON_EXTRACT_SCALAR(data, '$.isWeekend') AS BOOL) = TRUE
    OR CAST(JSON_EXTRACT_SCALAR(data, '$.isBusinessHours') AS BOOL) = FALSE
  )
GROUP BY visitorId
ORDER BY weekend_or_afterhours_visits DESC;
```

---

## 📋 Copy/Paste Behavior (#23)

**New events captured:**

| Event Type | Data Captured |
|------------|---------------|
| `text_copied` | textLength, textPreview (100 chars), page |
| `text_pasted` | fieldName, page |

**Query for copy behavior:**
```sql
SELECT 
  visitorId,
  COUNT(*) as copy_events,
  ARRAY_AGG(JSON_EXTRACT_SCALAR(data, '$.page')) as pages_copied_from,
  SUM(CAST(JSON_EXTRACT_SCALAR(data, '$.textLength') AS INT64)) as total_chars_copied
FROM outbound_sales.events
WHERE type = 'text_copied'
GROUP BY visitorId
ORDER BY copy_events DESC;
```

---

## 🌐 UTM & Source Tracking

**All UTM parameters captured:**

| Field | Description |
|-------|-------------|
| `utm_source` | email, google, linkedin, etc. |
| `utm_medium` | email, cpc, organic, social |
| `utm_campaign` | q1_outbound, webinar_promo |
| `utm_term` | Keywords (for paid search) |
| `utm_content` | A/B test variant |
| `gclid` | Google Ads click ID |
| `fbclid` | Facebook click ID |
| `msclkid` | Microsoft Ads click ID |
| `ref` | Generic referral parameter |
| `source` | Generic source parameter |
| `allUrlParams` | Object with ALL query parameters |

**Plus automatic channel detection:**

| Field | Description |
|-------|-------------|
| `defaultChannelSource` | Auto-detected when no UTM (organic_search_google, social_linkedin, direct, referral_domain.com) |
| `referrer` | Full referrer URL |
| `referrerDomain` | Just the domain |

**Query for traffic sources:**
```sql
SELECT 
  COALESCE(
    JSON_EXTRACT_SCALAR(data, '$.utm_source'),
    JSON_EXTRACT_SCALAR(data, '$.defaultChannelSource')
  ) as traffic_source,
  COUNT(DISTINCT visitorId) as visitors,
  COUNT(*) as pageviews
FROM outbound_sales.events
WHERE type = 'pageview'
GROUP BY traffic_source
ORDER BY visitors DESC;
```

---

## 🖥️ Network Context (#20 - Self-Detected)

**No external APIs - all from browser/Cloudflare:**

| Field | Description |
|-------|-------------|
| `connectionType` | 4g, 3g, 2g, slow-2g |
| `connectionDownlink` | Download speed (Mbps) |
| `connectionRtt` | Network latency (ms) |
| `asOrganization` | ISP name ("Google Fiber" = likely business) |
| `tlsVersion` | TLS 1.3, etc. |
| `httpProtocol` | HTTP/2, HTTP/3 |

---

## 📱 Device & Browser Details

**Full context for fingerprinting:**

| Field | Description |
|-------|-------------|
| `userAgent` | Full UA string |
| `platform` | MacIntel, Win32, Linux, iPhone |
| `language` | en-US |
| `languages` | [en-US, en, es] |
| `screenWidth`, `screenHeight` | Physical screen |
| `viewportWidth`, `viewportHeight` | Browser window |
| `devicePixelRatio` | Retina/HiDPI detection |
| `colorDepth` | 24, 32, etc. |
| `cookieEnabled` | true/false |

---

## 📍 Geographic Data

**From Cloudflare (no API needed):**

| Field | Description |
|-------|-------------|
| `ip` | IP address |
| `ipHash` | Hashed for privacy |
| `country` | US, UK, CA |
| `city` | New York, London |
| `region` | NY, California |
| `continent` | NA, EU, AS |
| `postalCode` | Zip code |
| `timezone` | America/New_York |
| `latitude`, `longitude` | Approximate |

---

## 🎯 Summary: New Data You Can Use for Scoring

### **Visit Patterns:**
- Visit count (1, 2, 3, ...)
- First visit vs return
- Days between visits
- Return timing (24h, 3d, week)

### **Company Activity:**
- Multiple visitors from same company
- Company identifier (IP subnet)
- ISP/organization name

### **Engagement Quality:**
- Reading time vs scanning time
- Reading ratio (quality metric)
- Time per page
- Pages per session
- Deep scrolls (75%+)

### **Behavior Signals:**
- Backtracking (revisiting pages)
- Device switching
- Weekend/after-hours visits
- Business hours vs personal time
- Copy/paste activity

### **Attribution:**
- All UTM parameters
- Auto-detected channel source
- Referrer domain
- Ad click IDs (gclid, fbclid)

### **Cross-Tracking:**
- Device fingerprint
- Browser ID
- Platform switching
- Multi-device usage

---

## 📈 Example Scoring Queries (You Build Your Own!)

### **Find Hot Leads:**
```sql
WITH visitor_signals AS (
  SELECT 
    visitorId,
    -- Visit frequency
    MAX(CAST(JSON_EXTRACT_SCALAR(data, '$.visitNumber') AS INT64)) as total_visits,
    
    -- Engagement quality
    SUM(CAST(JSON_EXTRACT_SCALAR(data, '$.readingTime') AS INT64)) as total_reading_time,
    SUM(CAST(JSON_EXTRACT_SCALAR(data, '$.pagesThisSession') AS INT64)) as total_pages,
    
    -- Behavior signals
    COUNTIF(type = 'text_copied') as copy_events,
    COUNTIF(CAST(JSON_EXTRACT_SCALAR(data, '$.isWeekend') AS BOOL)) as weekend_visits,
    COUNTIF(type = 'device_switched') as device_switches,
    
    -- Content
    COUNTIF(url LIKE '%/pricing%') as pricing_views,
    COUNTIF(url LIKE '%/demo%') as demo_views,
    
    -- Timestamps
    MIN(TIMESTAMP_MILLIS(timestamp)) as first_visit,
    MAX(TIMESTAMP_MILLIS(timestamp)) as last_visit
  FROM outbound_sales.events
  WHERE visitorId IS NOT NULL
  GROUP BY visitorId
)
SELECT 
  *,
  -- YOUR CUSTOM SCORING HERE
  CASE
    WHEN total_visits >= 3 AND total_reading_time > 300 THEN 'hot'
    WHEN total_visits >= 2 OR pricing_views > 0 THEN 'warm'
    ELSE 'cold'
  END as my_custom_score
FROM visitor_signals
ORDER BY total_visits DESC, total_reading_time DESC;
```

### **Find Multi-Person Companies:**
```sql
SELECT * FROM outbound_sales.company_activity
WHERE hasMultipleVisitors = TRUE
ORDER BY identifiedVisitors DESC;
```

### **Find Deep Researchers:**
```sql
SELECT * FROM outbound_sales.content_depth
WHERE depthCategory = 'deep_researcher'
  AND engagementQuality = 'engaged_reader'
ORDER BY pagesViewed DESC;
```

---

## 🎯 All New Views Created

1. **`company_activity`** - Multi-visitor companies
2. **`visitor_return_patterns`** - Return visit analysis (#4)
3. **`content_depth`** - Engagement quality (#5)
4. **`multi_device_visitors`** - Device switching (#19)
5. **`backtracking_visitors`** - Navigation patterns (#18)

---

## ✅ What You Have for Scoring

**Pure data, no calculations:**
- ✅ Visit count per visitor
- ✅ Multiple visitors per company flag
- ✅ Reading time vs scanning time
- ✅ Content depth (pages, time)
- ✅ Backtracking behavior
- ✅ Device switching
- ✅ Time-of-day patterns
- ✅ Copy/paste events
- ✅ All UTM data
- ✅ Referrer tracking
- ✅ Network context (connection type, etc.)

**Build YOUR OWN scoring logic using these signals!** 🎯

