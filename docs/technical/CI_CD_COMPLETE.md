# ✅ CI/CD Pipeline Complete!

Automatic deployment to Cloudflare Workers is now configured.

---

## 🎉 What Was Set Up

### GitHub Actions Workflows (3 files)

#### 1. **Production Deploy** (`.github/workflows/deploy.yml`)
- **Triggers:** Push to `main` branch
- **Actions:**
  - ✅ Install dependencies
  - ✅ Build tracking pixel
  - ✅ Deploy Worker to Cloudflare
  - ✅ Deploy pixel to Cloudflare Pages
  - ✅ Post deployment summary
- **Time:** ~2-3 minutes
- **Result:** Live on Cloudflare Workers immediately

#### 2. **Test & Lint** (`.github/workflows/test.yml`)
- **Triggers:** Push to `main`, `develop`, or Pull Requests
- **Actions:**
  - ✅ TypeScript type checking
  - ✅ Linting
  - ✅ Build verification
  - ✅ Pixel size check (<12KB)
  - ✅ Run tests
- **Time:** ~1 minute

#### 3. **Staging Deploy** (`.github/workflows/staging.yml`)
- **Triggers:** Push to `develop` or `staging` branch
- **Actions:**
  - ✅ Deploy to staging environment
  - ✅ Use staging credentials
- **Time:** ~2 minutes

### GitHub Configuration (5 files)

#### 4. **Dependabot** (`.github/dependabot.yml`)
- Automatic dependency updates
- Weekly checks for npm and GitHub Actions
- Auto-creates PRs for updates

#### 5. **Pull Request Template** (`.github/pull_request_template.md`)
- Standardized PR format
- Checklist for code review
- Testing requirements

#### 6. **Bug Report Template** (`.github/ISSUE_TEMPLATE/bug_report.md`)
- Structured bug reporting
- Environment details
- Reproduction steps

#### 7. **Feature Request Template** (`.github/ISSUE_TEMPLATE/feature_request.md`)
- Standardized feature proposals
- Use case documentation
- Priority levels

#### 8. **Funding Info** (`.github/FUNDING.yml`)
- Optional sponsorship links

### Scripts & Documentation (2 files)

#### 9. **GitHub Secrets Setup Script** (`scripts/setup-github-secrets.sh`)
- Interactive CLI tool
- Sets up all required secrets
- Validates configuration

#### 10. **CI/CD Documentation** (`CI_CD_SETUP.md`)
- Complete setup guide
- Troubleshooting
- Best practices

---

## 🚀 How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTOMATIC DEPLOYMENT FLOW                    │
└─────────────────────────────────────────────────────────────────┘

1. You push code                git push origin main
   │
   ├─ GitHub detects push
   │
   ├─ GitHub Actions starts
   │  ├─ Checkout code
   │  ├─ Install dependencies
   │  ├─ Build pixel
   │  ├─ Run tests ✅
   │  ├─ Deploy to Cloudflare ✅
   │  └─ Deployment complete! 🎉
   │
   └─ Live in ~2 minutes       https://your-worker.workers.dev
```

---

## 📋 Setup Instructions

### Option 1: Interactive Script (Recommended)

```bash
# Install GitHub CLI (if not installed)
brew install gh

# Authenticate
gh auth login

# Run setup script
./scripts/setup-github-secrets.sh

# Follow prompts to enter all secrets
```

### Option 2: Manual Setup

See detailed instructions in [CI_CD_SETUP.md](CI_CD_SETUP.md)

### Required Secrets (7 total)

1. `CLOUDFLARE_API_TOKEN` - API token with Workers permissions
2. `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
3. `BIGQUERY_PROJECT_ID` - GCP project ID
4. `BIGQUERY_DATASET` - Dataset name (usually `outbound_sales`)
5. `BIGQUERY_CREDENTIALS` - Complete service account JSON
6. `EVENT_SIGNING_SECRET` - Random 32+ char string
7. `ALLOWED_ORIGINS` - Comma-separated allowed domains

**Get all secrets here:**
- Cloudflare: https://dash.cloudflare.com/profile/api-tokens
- GCP: https://console.cloud.google.com/iam-admin/serviceaccounts

---

## 🎯 First Deployment

### Step 1: Add Secrets

```bash
# Use the setup script
./scripts/setup-github-secrets.sh

# Or add manually in GitHub
# Settings → Secrets and variables → Actions → New repository secret
```

### Step 2: Initialize Git Repository

```bash
# If not already initialized
git init
git add .
git commit -m "Initial commit with CI/CD"

# Add remote (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

### Step 3: Push to GitHub

```bash
git push -u origin main
```

### Step 4: Watch Deployment

1. Go to your GitHub repo
2. Click **Actions** tab
3. See workflow running
4. Wait ~2-3 minutes
5. Check ✅ when complete

### Step 5: Verify Deployment

```bash
# Your Worker should be live at:
https://outbound-intent-engine.YOUR_ACCOUNT.workers.dev

# Test health endpoint
curl https://outbound-intent-engine.YOUR_ACCOUNT.workers.dev/health

# Should return:
{"status":"ok","timestamp":1234567890}
```

---

## 🌿 Branch Strategy

### Recommended Workflow

```
main (production)
 ├─ Auto-deploys to production
 ├─ Protected branch (require PR reviews)
 └─ https://your-worker.workers.dev
 
develop (staging)
 ├─ Auto-deploys to staging environment
 └─ https://staging.your-worker.workers.dev
 
feature/* (development)
 ├─ Runs tests only (no deployment)
 └─ Create PR to develop
```

### Daily Workflow

```bash
# Create feature branch
git checkout -b feature/add-new-event

# Make changes
# ... edit code ...

# Commit
git commit -m "Add new event tracking"

# Push (triggers tests)
git push origin feature/add-new-event

# Create PR to develop → merges → deploys to staging

# Test in staging → if good, merge develop → main → deploys to production
```

---

## 📊 Monitoring Deployments

### GitHub Actions Dashboard

View all deployments:
```
https://github.com/YOUR_USERNAME/YOUR_REPO/actions
```

### See Latest Deployment

```bash
# Install GitHub CLI if needed
brew install gh

# View recent runs
gh run list --workflow=deploy.yml

# View specific run logs
gh run view --log
```

### Cloudflare Dashboard

Monitor worker:
```
https://dash.cloudflare.com → Workers & Pages → Your Worker
```

**View:**
- Deployment history
- Real-time logs
- Analytics
- Request metrics

### Stream Live Logs

```bash
npx wrangler tail
```

---

## 🎨 Deployment Badges

Add to your README.md:

```markdown
![Deploy](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy.yml/badge.svg)
![Test](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/test.yml/badge.svg)
```

Shows deployment status:
- ✅ Green = Passing
- ❌ Red = Failed
- 🟡 Yellow = Running

---

## 🔧 Customization

### Deploy Only on Tags

Edit `.github/workflows/deploy.yml`:

```yaml
on:
  push:
    tags:
      - 'v*'  # Only deploy on version tags
```

Usage:
```bash
git tag v1.0.0
git push origin v1.0.0  # Triggers deployment
```

### Add Slack Notifications

Add to workflow:

```yaml
- name: Notify Slack
  if: always()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Multiple Environments

Create `.github/workflows/production.yml` and `.github/workflows/staging.yml`

Use different secrets per environment.

---

## 🚨 Troubleshooting

### Deployment Fails

**Check logs:**
```bash
# GitHub Actions
gh run view --log

# Or visit Actions tab in GitHub
```

**Common issues:**

1. **"Unauthorized"**
   - Check `CLOUDFLARE_API_TOKEN` is correct
   - Regenerate if needed

2. **"Secrets not found"**
   - Verify all 7 required secrets are set
   - Check for typos in secret names

3. **"BigQuery credentials invalid"**
   - Re-download service account JSON
   - Paste entire contents to secret

4. **"Worker deployment failed"**
   - Check `wrangler.toml` has correct KV namespace IDs
   - Verify account ID matches

### Tests Fail

```bash
# Run locally to debug
npm run build:pixel
npm test

# Check TypeScript errors
npx tsc --noEmit
```

### Pixel Too Large

```bash
# Check size
npm run build:pixel
ls -lh dist/pixel.iife.js

# Should be <12KB
# If larger, optimize vite.config.ts
```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] All 7 secrets added to GitHub
- [ ] `wrangler.toml` has KV namespace IDs
- [ ] Push to `main` triggers deployment
- [ ] Deployment completes successfully (green ✅)
- [ ] Worker accessible at URL
- [ ] Health endpoint returns OK
- [ ] Test event reaches BigQuery
- [ ] Logs visible in Cloudflare dashboard

---

## 💰 Cost Impact

**GitHub Actions:**
- ✅ Free for public repos (unlimited)
- ✅ Private repos: 2,000 minutes/month free
- Each deployment: ~3 minutes
- ~660 deployments/month on free tier

**Cloudflare:**
- No change - same pricing as manual deploy
- $5/month for 10M requests

**Total additional cost:** $0 for most use cases

---

## 🎓 Learning Resources

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Wrangler Action](https://github.com/cloudflare/wrangler-action)
- [CI/CD Best Practices](https://docs.github.com/en/actions/deployment)

---

## 📚 Related Documentation

- [CI_CD_SETUP.md](CI_CD_SETUP.md) - Detailed setup guide
- [DEPLOYMENT.md](DEPLOYMENT.md) - Manual deployment
- [DEVELOPMENT.md](DEVELOPMENT.md) - Local development
- [QUICK_START.md](QUICK_START.md) - Quick start guide

---

## 🎉 You're Done!

Your CI/CD pipeline is configured. From now on:

1. ✅ Make code changes
2. ✅ Commit and push to `main`
3. ✅ Watch GitHub Actions deploy automatically
4. ✅ Live on Cloudflare in ~2 minutes

**No more manual deployments!** 🚀

---

## 🚀 Next Push Will Deploy Automatically

Try it now:

```bash
# Make a small change
echo "# Test CI/CD" >> README.md

# Commit and push
git add .
git commit -m "Test automatic deployment"
git push origin main

# Watch in GitHub:
# https://github.com/YOUR_USERNAME/YOUR_REPO/actions
```

**Questions?** See [CI_CD_SETUP.md](CI_CD_SETUP.md) or open an issue.

---

Built with ❤️ for Revenue Institute  
Auto-deployment configured on $(date)

