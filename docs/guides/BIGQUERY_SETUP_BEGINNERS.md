# Google BigQuery Setup for Beginners 📊

**Complete guide for non-technical users to set up BigQuery**

No coding knowledge needed! Just follow these steps exactly.

---

## 📋 What You'll Need

- ✅ 20 minutes of time
- ✅ A credit card (Google requires it, but won't charge unless you go over $300 FREE credit)
- ✅ A Google account (Gmail)

**Cost:** $0/month for most use cases (free $300 credit + generous free tier)

---

## 🎯 Step 1: Create Google Cloud Account (5 minutes)

### 1.1 Go to Google Cloud

1. Open browser and go to: **https://cloud.google.com**

2. Click **"Get started for free"** (blue button in top right)

3. Sign in with your Google account (Gmail)
   - Use your work email if possible
   - Or any Gmail account

### 1.2 Set Up Billing

1. Select your **Country**

2. Check the boxes:
   - ✅ "I agree to the Terms of Service"
   - Click **"Continue"**

3. Enter your information:
   - Account type: Individual or Business
   - Name and address
   - Credit card details

**Don't worry!** You get $300 free credit and won't be charged unless you manually upgrade.

4. Click **"Start my free trial"**

**✅ Your Google Cloud account is ready!**

---

## 📁 Step 2: Create a Project (3 minutes)

### 2.1 Create New Project

1. You'll see the Google Cloud Console dashboard

2. At the top, click the **project dropdown**
   - It might say "My First Project" or "Select a project"

3. Click **"NEW PROJECT"** button (top right of popup)

4. Fill in:
   - **Project name:** `Outbound Intent Engine`
   - **Organization:** Leave as-is
   - **Location:** Leave as-is

5. Click **"CREATE"**

6. Wait 10 seconds for project to be created

### 2.2 Get Your Project ID

1. After creation, look at the top bar

2. You'll see your project name and below it, a Project ID like:
   ```
   outbound-intent-engine-123456
   ```

3. **Copy this Project ID**

4. Add to your Notepad file:
   ```
   GOOGLE CLOUD PROJECT ID:
   outbound-intent-engine-123456
   ```

---

## 🔓 Step 3: Enable BigQuery (2 minutes)

### 3.1 Enable the API

1. In the search bar at top, type: **"BigQuery"**

2. Click on **"BigQuery API"** in results

3. Click the blue **"ENABLE"** button

4. Wait 30 seconds

5. You'll see "API enabled" ✅

### 3.2 Open BigQuery

1. Click the **☰ hamburger menu** (top left)

2. Scroll down to **"Analytics"** section

3. Click **"BigQuery"**

4. You'll see the BigQuery interface

**✅ BigQuery is now enabled!**

---

## 🗄️ Step 4: Create Dataset (3 minutes)

### 4.1 Create Dataset

1. In BigQuery, look at the left sidebar

2. Find your project name (under "Explorer")
   - Click the **three dots (⋮)** next to your project name

3. Click **"Create dataset"**

4. Fill in:
   - **Dataset ID:** `outbound_sales`
   - **Data location:** Choose closest to you:
     - US: `us (multiple regions in United States)`
     - Europe: `EU (multiple regions in European Union)`
     - Other: Choose your region
   - **Default table expiration:** Leave unchecked

5. Click **"CREATE DATASET"**

**✅ Your dataset is created!**

Add to Notepad:
```
BIGQUERY DATASET:
outbound_sales
```

---

## 🔑 Step 5: Create Service Account (5 minutes)

This is like creating a special "robot user" that your code can use to access BigQuery.

### 5.1 Navigate to Service Accounts

1. Click **☰ hamburger menu** (top left)

2. Scroll to **"IAM & Admin"**

3. Click **"Service Accounts"**

4. Or go directly to: **https://console.cloud.google.com/iam-admin/serviceaccounts**

### 5.2 Create Service Account

1. Click **"+ CREATE SERVICE ACCOUNT"** (top)

2. Fill in:
   - **Service account name:** `outbound-intent-tracker`
   - **Service account ID:** (auto-filled)
   - **Description:** `Service account for Outbound Intent Engine`

3. Click **"CREATE AND CONTINUE"**

### 5.3 Grant Permissions

1. Under "Grant this service account access to project"

2. Click **"Select a role"** dropdown

3. Type "BigQuery" in the search

4. Select these TWO roles:
   - **BigQuery Data Editor**
   - **BigQuery Job User**

How to add both:
- Click dropdown → select "BigQuery Data Editor" → click "+ ADD ANOTHER ROLE"
- Click new dropdown → select "BigQuery Job User"

5. Click **"CONTINUE"**

6. Click **"DONE"** (skip the optional step)

### 5.4 Create Key (Download JSON)

**⚠️ IMPORTANT: This file is sensitive - don't share it!**

1. You'll see your service account in the list

2. Click on the **email address** (looks like: outbound-intent-tracker@...)

3. Click **"KEYS"** tab at top

4. Click **"ADD KEY"** → **"Create new key"**

5. Select **"JSON"** (should be selected by default)

6. Click **"CREATE"**

7. A file downloads automatically:
   - Named something like: `outbound-intent-engine-123456-a1b2c3d4e5f6.json`
   - Save it to your Downloads folder

**✅ Service account created!**

---

## 📊 Step 6: Create Tables (5 minutes)

Now we need to create the database tables where your data will be stored.

### 6.1 Open BigQuery Console

1. Click **☰ hamburger menu**

2. Navigate to **BigQuery**

3. Or go to: **https://console.cloud.google.com/bigquery**

### 6.2 Upload Schema File

**Option A: Using the Web Interface (Easiest)**

1. In your project folder, find: `bigquery/schema.sql`

2. Open it with TextEdit (Mac) or Notepad (Windows)

3. Copy ALL the contents (Cmd+A or Ctrl+A, then Cmd+C or Ctrl+C)

4. In BigQuery console, click **"+ COMPOSE NEW QUERY"** (top left)

5. Paste the SQL code

6. Click **"RUN"** button

7. Wait for it to complete (you'll see green checkmarks)

**Option B: Using Command Line (If comfortable)**

```bash
bq query --use_legacy_sql=false < bigquery/schema.sql
```

**✅ Tables created!**

### 6.3 Verify Tables Exist

1. In BigQuery left sidebar, expand your dataset (`outbound_sales`)

2. You should see 5 tables:
   - ✅ `events`
   - ✅ `sessions`
   - ✅ `lead_profiles`
   - ✅ `identity_map`
   - ✅ `email_clicks`

3. And 4 views:
   - ✅ `high_intent_leads`
   - ✅ `campaign_performance`
   - ✅ `recent_sessions`
   - ✅ `intent_distribution`

If you see all of these, **you're done!** ✅

---

## 📝 Step 7: Save Everything to Notepad (2 minutes)

### 7.1 Organize Your Information

Update your Notepad file with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOOGLE CLOUD / BIGQUERY INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROJECT ID:
outbound-intent-engine-123456

DATASET NAME:
outbound_sales

SERVICE ACCOUNT EMAIL:
outbound-intent-tracker@outbound-intent-engine-123456.iam.gserviceaccount.com

SERVICE ACCOUNT JSON FILE LOCATION:
/Users/YOUR_NAME/Downloads/outbound-intent-engine-123456-a1b2c3d4e5f6.json

DATA LOCATION:
us (or your chosen region)
```

### 7.2 Move Service Account File

**IMPORTANT:** Move your JSON file to a safe location

1. Create a folder: `cloudflare-secrets`
   - In Documents or somewhere safe
   - NOT in a public folder
   - NOT in your Downloads (easy to delete by accident)

2. Move the JSON file there

3. Rename it to something simple: `bigquery-service-account.json`

4. Update the path in your Notepad

---

## 🎉 Step 8: You're Done with BigQuery!

You've successfully:
- ✅ Created Google Cloud account
- ✅ Created a project
- ✅ Enabled BigQuery
- ✅ Created dataset
- ✅ Created service account with permissions
- ✅ Downloaded JSON key file
- ✅ Created all tables and views

---

## 💰 Will This Cost Money?

**No!** Here's why:

**Free Credits:**
- $300 free credit for first 90 days
- Even after, BigQuery has a generous free tier

**Free Tier (every month):**
- First 10 GB of storage: FREE
- First 1 TB of queries: FREE

**Typical usage:**
- Storage: ~1 GB/month = **$0**
- Queries: ~50 GB/month = **$0**

You'd need to process 20 TB of data per month to spend $100. For most small-to-medium businesses, BigQuery costs $0-10/month.

---

## 🆘 Troubleshooting

### Can't find "BigQuery" in menu

1. Use the search bar at top
2. Type "BigQuery"
3. Click on "BigQuery" result

### "API not enabled" error

1. Go to: https://console.cloud.google.com/apis/library
2. Search "BigQuery API"
3. Click "Enable"

### Can't create service account

Make sure:
- You're the owner of the project
- You selected the correct project (check dropdown at top)

### Downloaded JSON file is empty

1. Go back to Service Accounts
2. Find your service account
3. Click "KEYS" tab
4. Delete the old key
5. Create new key → JSON
6. Download again

### Tables didn't create

1. Check you selected the right project
2. Make sure dataset exists
3. Try running each CREATE TABLE statement one at a time
4. Look for red error messages

---

## 🔐 Security Best Practices

**DO:**
- ✅ Keep your JSON file safe and private
- ✅ Never upload to public GitHub
- ✅ Store in a secure folder

**DON'T:**
- ❌ Share your JSON file with anyone
- ❌ Email it to yourself (could be intercepted)
- ❌ Post it in Slack or chat
- ❌ Commit it to git

Think of it like a password - keep it secret!

---

## 🎓 What Did We Just Do?

**In simple terms:**

1. **Google Cloud Project** = Your workspace in Google's cloud (like a company account)

2. **BigQuery** = A massive database that can handle billions of rows (like a giant Excel spreadsheet)

3. **Dataset** = A folder that contains your tables (like a folder for your spreadsheets)

4. **Tables** = Where your data is stored (like individual Excel sheets)

5. **Service Account** = A "robot user" that your code uses to access BigQuery (like giving your code a key card)

6. **JSON Key** = The password for your robot user

Think of it like:
- Project = Your office building
- BigQuery = Your filing system
- Dataset = A filing cabinet
- Tables = Individual folders in the cabinet
- Service Account = A robot assistant
- JSON Key = The robot's ID badge

---

## ✅ Checklist

Before moving to next step:

- [ ] Google Cloud account created
- [ ] Project created and project ID copied
- [ ] BigQuery enabled
- [ ] Dataset `outbound_sales` created
- [ ] Service account created with correct permissions
- [ ] JSON key file downloaded
- [ ] JSON file moved to safe location
- [ ] All 5 tables created
- [ ] All 4 views created
- [ ] Everything saved in Notepad

---

## 📊 Quick Test

Want to make sure it worked?

1. Go to BigQuery console
2. Click "+ COMPOSE NEW QUERY"
3. Paste this:

```sql
SELECT 'BigQuery is working!' as message
```

4. Click "RUN"

If you see "BigQuery is working!" in the results, **you're all set!** ✅

---

## 🚀 Next Steps

Now you need to:

1. ✅ **Set up GitHub** (for automatic deployment)
   - See: **GITHUB_SETUP_BEGINNERS.md**

2. ✅ **Connect everything together**
   - See: **FINAL_SETUP_BEGINNERS.md**

---

## 📞 Need Help?

If you get stuck:

1. Re-read the step you're on carefully
2. Check the Troubleshooting section
3. Make sure you followed every step exactly
4. Take a screenshot of any error messages

---

## 🎉 Great Job!

You've completed the BigQuery setup! This is the most technical part - the rest is easier.

**Next:** Set up GitHub for automatic deployment

See: **GITHUB_SETUP_BEGINNERS.md**

---

**Remember:** Keep your JSON key file safe and never share it publicly!

