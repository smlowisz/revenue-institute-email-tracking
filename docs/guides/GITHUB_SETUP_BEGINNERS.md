# GitHub Setup for Beginners 🚀

**Complete guide for non-technical users to set up GitHub and automatic deployment**

No coding knowledge needed! Just follow these steps exactly.

---

## 📋 What You'll Need

- ✅ 15 minutes of time
- ✅ Email address
- ✅ Your Cloudflare information (from previous steps)
- ✅ Your BigQuery information (from previous steps)

**Cost:** $0/month (GitHub is free for public repositories)

---

## 🎯 Step 1: Create GitHub Account (3 minutes)

### 1.1 Sign Up

1. Go to: **https://github.com/signup**

2. Fill in:
   - Your email address
   - Create a password (write it down!)
   - Choose a username (like: johndoe-revenue)

3. Complete the puzzle (to prove you're human)

4. Click **"Create account"**

5. Check your email for verification code

6. Enter the code on GitHub

**✅ Your GitHub account is ready!**

---

## 📁 Step 2: Create Repository (5 minutes)

A "repository" is like a folder for your project.

### 2.1 Create New Repository

1. Click the **"+"** button (top right)

2. Click **"New repository"**

3. Fill in:
   - **Repository name:** `outbound-intent-engine`
   - **Description:** `Outbound Intent Engine - Track visitor behavior from cold emails`
   - **Public or Private:**
     - **Public** = Free, anyone can see
     - **Private** = $4/month, only you can see
     - Choose **Public** for now (you can change later)
   - ✅ Check "Add a README file"

4. Click **"Create repository"** (green button)

**✅ Your repository is created!**

### 2.2 Get Repository URL

You'll see a page with your new repository.

The URL looks like:
```
https://github.com/YOUR_USERNAME/outbound-intent-engine
```

Add to your Notepad:
```
GITHUB REPOSITORY:
https://github.com/YOUR_USERNAME/outbound-intent-engine
```

---

## 🔐 Step 3: Add Secrets (10 minutes)

"Secrets" are secure passwords and keys that GitHub will use to deploy your code.

### 3.1 Navigate to Settings

1. In your repository, click **"Settings"** tab (top right)

2. In left sidebar, click **"Secrets and variables"**

3. Click **"Actions"**

4. Or go directly to:
   ```
   https://github.com/YOUR_USERNAME/outbound-intent-engine/settings/secrets/actions
   ```

### 3.2 Add Each Secret

You'll add 7 secrets total. For each one:

1. Click **"New repository secret"** (green button)
2. Enter the "Name" exactly as shown
3. Paste the "Value" from your Notepad
4. Click **"Add secret"**

---

#### Secret 1: CLOUDFLARE_API_TOKEN

- **Name:** `CLOUDFLARE_API_TOKEN`
- **Value:** (from your Notepad - the long Cloudflare token)
- Click "Add secret"

✅ Added!

---

#### Secret 2: CLOUDFLARE_ACCOUNT_ID

- **Name:** `CLOUDFLARE_ACCOUNT_ID`
- **Value:** (from your Notepad - your Cloudflare account ID)
- Click "Add secret"

✅ Added!

---

#### Secret 3: BIGQUERY_PROJECT_ID

- **Name:** `BIGQUERY_PROJECT_ID`
- **Value:** (from your Notepad - your Google Cloud project ID)
  - Example: `outbound-intent-engine-123456`
- Click "Add secret"

✅ Added!

---

#### Secret 4: BIGQUERY_DATASET

- **Name:** `BIGQUERY_DATASET`
- **Value:** `outbound_sales`
- Click "Add secret"

✅ Added!

---

#### Secret 5: BIGQUERY_CREDENTIALS

**⚠️ SPECIAL: This one is the entire JSON file**

- **Name:** `BIGQUERY_CREDENTIALS`
- **Value:** (Need to paste entire JSON file contents)

**How to get the value:**

1. Find your JSON file (from BigQuery setup)
   - Location: Where you saved `bigquery-service-account.json`

2. Open it with TextEdit (Mac) or Notepad (Windows)

3. Select ALL text (Cmd+A or Ctrl+A)

4. Copy (Cmd+C or Ctrl+C)

5. Paste into the "Value" field on GitHub

6. It should look like:
   ```json
   {
     "type": "service_account",
     "project_id": "outbound-intent-engine-123456",
     "private_key_id": "...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
     ...
   }
   ```

7. Click "Add secret"

✅ Added!

---

#### Secret 6: EVENT_SIGNING_SECRET

This is a random password we'll generate.

**On Mac:**
1. Open Terminal
2. Run: `openssl rand -hex 32`
3. Copy the output (long random string)

**On Windows:**
1. Open PowerShell
2. Run: `-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})`
3. Copy the output

**Or use this website:**
- Go to: https://www.random.org/strings/
- Num: 1, Length: 32, Unique: Yes
- Click "Get Strings"
- Copy the result

- **Name:** `EVENT_SIGNING_SECRET`
- **Value:** (paste the random string you generated)
- Click "Add secret"

✅ Added!

---

#### Secret 7: ALLOWED_ORIGINS

This is your website URL(s) where the tracking pixel will run.

- **Name:** `ALLOWED_ORIGINS`
- **Value:** Your website URL
  - Example: `https://yourdomain.com`
  - Multiple URLs: `https://yourdomain.com,https://www.yourdomain.com`
  - For testing: `https://yourdomain.com,http://localhost:5173`

- Click "Add secret"

✅ Added!

---

### 3.3 Verify All Secrets

You should now see 7 secrets:

- ✅ CLOUDFLARE_API_TOKEN
- ✅ CLOUDFLARE_ACCOUNT_ID
- ✅ BIGQUERY_PROJECT_ID
- ✅ BIGQUERY_DATASET
- ✅ BIGQUERY_CREDENTIALS
- ✅ EVENT_SIGNING_SECRET
- ✅ ALLOWED_ORIGINS

**If you're missing any, go back and add them!**

---

## 📤 Step 4: Upload Your Code (5 minutes)

Now we need to put your code into GitHub.

### Option A: Using GitHub Desktop (Easiest)

#### 4.1 Install GitHub Desktop

1. Go to: **https://desktop.github.com**
2. Download for your operating system
3. Install the app
4. Open GitHub Desktop
5. Sign in with your GitHub account

#### 4.2 Clone Your Repository

1. Click **"File"** → **"Clone repository"**
2. Find `outbound-intent-engine` in the list
3. Choose where to save it on your computer
4. Click **"Clone"**

#### 4.3 Copy Your Project Files

1. Open Finder (Mac) or File Explorer (Windows)

2. Navigate to your project folder:
   ```
   Documents/Github-Cursor/Revenue Institute/revenue-institute-email-tracking
   ```

3. Select ALL files and folders (Cmd+A or Ctrl+A)

4. Copy them (Cmd+C or Ctrl+C)

5. Navigate to your cloned repository folder
   - GitHub Desktop shows you the path at the top
   - Or check where you cloned it

6. Paste all files (Cmd+V or Ctrl+V)

7. Replace the existing README.md when asked

#### 4.4 Commit and Push

1. Go back to GitHub Desktop

2. You'll see all the files listed on the left

3. In the bottom left:
   - **Summary:** Type "Initial commit with complete code"
   - **Description:** (optional)

4. Click **"Commit to main"** button

5. Click **"Push origin"** button at the top

6. Wait for upload to complete (may take 1-2 minutes)

**✅ Code uploaded!**

---

### Option B: Using Command Line (If Comfortable)

```bash
# Navigate to your project
cd "/Users/YOUR_NAME/Documents/Github-Cursor/Revenue Institute/revenue-institute-email-tracking"

# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit with complete code"

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/outbound-intent-engine.git

# Push
git push -u origin main
```

---

## 🎉 Step 5: Watch Automatic Deployment! (3 minutes)

Once you push your code, GitHub will automatically deploy it!

### 5.1 View Actions

1. Go to your repository on GitHub

2. Click **"Actions"** tab (top menu)

3. You'll see a workflow running (yellow circle spinning)

4. Click on the workflow name to see details

5. Watch it complete (takes 2-3 minutes)

6. When done, you'll see green checkmarks ✅

**✅ Deployed automatically!**

### 5.2 Get Your Worker URL

After deployment completes:

1. Go to Cloudflare Dashboard: **https://dash.cloudflare.com**

2. Click **"Workers & Pages"** in left menu

3. Click on **"outbound-intent-engine"**

4. You'll see your Worker URL:
   ```
   https://outbound-intent-engine.YOUR_ACCOUNT.workers.dev
   ```

5. Copy this URL - you'll need it!

### 5.3 Test Your Worker

Open your browser and go to:
```
https://outbound-intent-engine.YOUR_ACCOUNT.workers.dev/health
```

You should see:
```json
{"status":"ok","timestamp":1234567890}
```

**✅ IT WORKS!** 🎉

---

## 🎯 Step 6: Update wrangler.toml One More Time

Now that you know your Worker URL, let's finalize the configuration.

### 6.1 Edit wrangler.toml

1. Open GitHub Desktop (or your cloned repo folder)

2. Find and open: `wrangler.toml`

3. Update the `name` if needed (line 1):
   ```toml
   name = "outbound-intent-engine"
   ```

4. Make sure KV namespaces are correct (you did this earlier):
   ```toml
   kv_namespaces = [
     { binding = "IDENTITY_STORE", id = "your-kv-id", preview_id = "your-preview-id" },
     { binding = "PERSONALIZATION", id = "your-personalization-id", preview_id = "your-preview-id" }
   ]
   ```

5. Save the file

6. In GitHub Desktop:
   - Summary: "Update wrangler.toml configuration"
   - Click "Commit to main"
   - Click "Push origin"

7. Watch it deploy again in the Actions tab!

---

## ✅ You're Done with GitHub!

You've successfully:
- ✅ Created GitHub account
- ✅ Created repository
- ✅ Added all 7 secrets
- ✅ Uploaded your code
- ✅ Watched automatic deployment
- ✅ Tested your Worker URL

---

## 🎓 What Did We Just Do?

**In simple terms:**

1. **GitHub** = A place to store your code online (like Dropbox for code)

2. **Repository** = Your project folder on GitHub

3. **Secrets** = Secure passwords that GitHub uses to deploy your code

4. **Actions** = Automatic processes that run when you update code (like having a robot assistant)

5. **Commit** = Save a version of your code

6. **Push** = Upload your code to GitHub

7. **Deploy** = Put your code live on the internet

Think of it like:
- GitHub = A storage locker for your recipes
- Repository = Your recipe book
- Secrets = The keys to your restaurant
- Actions = A robot chef that cooks your recipes
- Commit = Writing down a recipe
- Push = Putting the recipe book in the locker
- Deploy = The robot chef makes the food and serves it

---

## 💰 Will This Cost Money?

**No!** Here's why:

**GitHub Free includes:**
- ✅ Unlimited public repositories
- ✅ 2,000 Action minutes/month (deployments)
- ✅ Each deployment: ~3 minutes
- ✅ = 660 deployments/month FREE

You'll only pay if:
- You make repository private ($4/month)
- You deploy more than 660 times/month (unlikely!)

**Typical cost: $0/month**

---

## 🆘 Troubleshooting

### Deployment Failed (Red X)

1. Click on the failed workflow
2. Look for red error messages
3. Common issues:
   - Wrong secret values → Check and re-enter
   - Missing secrets → Add all 7
   - Invalid JSON → Re-paste BIGQUERY_CREDENTIALS

### Can't Find Actions Tab

- Make sure you're in your repository
- Look at the top menu
- Should see: Code, Issues, Pull requests, **Actions**

### "Permission denied" Error

- Make sure you're signed into GitHub
- Check you're the owner of the repository

### Secrets Not Showing After Adding

- This is normal - GitHub hides secret values for security
- You'll see the names but not the values
- They're there and working!

### Code Didn't Upload

**GitHub Desktop:**
- Make sure you clicked "Commit to main"
- Then clicked "Push origin"
- Check network connection

**Command Line:**
- Run `git status` to see what's happening
- Make sure you ran all commands
- Check you have internet connection

---

## 🔐 Security Tips

**DO:**
- ✅ Keep your GitHub password safe
- ✅ Enable two-factor authentication (2FA)
- ✅ Never share your secrets
- ✅ Use strong passwords

**DON'T:**
- ❌ Share your GitHub password
- ❌ Make repository public if it contains sensitive data
- ❌ Edit secrets unless you need to update them

---

## 🚀 From Now On...

Every time you make changes to your code:

1. Edit files on your computer
2. Open GitHub Desktop (or use command line)
3. Write a commit message
4. Click "Commit to main"
5. Click "Push origin"
6. Watch it auto-deploy in 2-3 minutes! 🎉

**No more manual deployment!**

---

## ✅ Checklist

Before moving to final steps:

- [ ] GitHub account created
- [ ] Repository created
- [ ] All 7 secrets added
- [ ] Code uploaded to GitHub
- [ ] Deployment completed successfully
- [ ] Worker URL obtained
- [ ] Health endpoint tested and working
- [ ] Worker URL saved in Notepad

---

## 🎉 Congratulations!

You've completed all the technical setup!

**What you've accomplished:**
- ✅ Set up Cloudflare Workers
- ✅ Set up Google BigQuery
- ✅ Set up GitHub with automatic deployment
- ✅ Deployed your tracking system to the cloud
- ✅ Everything is live and working!

---

## 🚀 Next Steps

Now you're ready to:

1. ✅ **Add tracking pixel to your website**
   - See: **WEBSITE_SETUP_BEGINNERS.md**

2. ✅ **Create your first campaign**
   - See: **CAMPAIGN_CREATION_BEGINNERS.md**

3. ✅ **View your data**
   - See: **VIEWING_DATA_BEGINNERS.md**

---

## 📞 Need Help?

If you get stuck:

1. Re-read the step carefully
2. Check the Troubleshooting section
3. Look at your error messages
4. Make sure all 7 secrets are correctly entered
5. Try the deployment again

---

**Great work! You're now a DevOps pro!** 🎉

Next: **WEBSITE_SETUP_BEGINNERS.md**

