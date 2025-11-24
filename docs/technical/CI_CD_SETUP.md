# CI/CD Setup Guide

Automatic deployment to Cloudflare Workers on every push to main.

---

## 🚀 Overview

This project uses **GitHub Actions** to automatically:
- ✅ Build the tracking pixel
- ✅ Run tests and type checking
- ✅ Deploy Worker to Cloudflare
- ✅ Deploy pixel to Cloudflare Pages
- ✅ Support staging and production environments

**Deployment Flow:**
```
Push to main → GitHub Actions → Build → Deploy to Cloudflare → Live in ~2 minutes
```

---

## 📋 Prerequisites

1. ✅ GitHub repository for this code
2. ✅ Cloudflare account with Workers and Pages
3. ✅ Cloudflare API token
4. ✅ BigQuery project and credentials

---

## 🔧 Setup Instructions

### Step 1: Create Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use template: "Edit Cloudflare Workers"
4. Add permissions:
   - **Account** → Workers Scripts → Edit
   - **Account** → Account Settings → Read
   - **Zone** → Workers Routes → Edit (if using custom domains)
5. Click "Continue to summary" → "Create Token"
6. **Copy the token** (you won't see it again!)

### Step 2: Get Cloudflare Account ID

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain
3. Scroll down in the sidebar → Account ID is shown on the right
4. **Copy the Account ID**

### Step 3: Add GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

#### Required Secrets

| Secret Name | Value | Where to Get |
|-------------|-------|--------------|
| `CLOUDFLARE_API_TOKEN` | Your API token | From Step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID | From Step 2 |
| `BIGQUERY_PROJECT_ID` | Your GCP project ID | Google Cloud Console |
| `BIGQUERY_DATASET` | `outbound_sales` | Your dataset name |
| `BIGQUERY_CREDENTIALS` | Full JSON key | Service account JSON (paste entire file) |
| `EVENT_SIGNING_SECRET` | Random 32+ char string | Generate: `openssl rand -hex 32` |
| `ALLOWED_ORIGINS` | `https://yourdomain.com` | Your website URLs (comma-separated) |

#### Optional Secrets (for Staging)

| Secret Name | Value |
|-------------|-------|
| `BIGQUERY_PROJECT_ID_STAGING` | Staging project ID |
| `BIGQUERY_DATASET_STAGING` | `outbound_sales_staging` |
| `BIGQUERY_CREDENTIALS_STAGING` | Staging service account JSON |
| `ALLOWED_ORIGINS_STAGING` | `https://staging.yourdomain.com` |

### Step 4: Configure wrangler.toml

Update `wrangler.toml` with your KV namespace IDs:

```toml
kv_namespaces = [
  { binding = "IDENTITY_STORE", id = "YOUR_KV_ID", preview_id = "YOUR_PREVIEW_ID" },
  { binding = "PERSONALIZATION", id = "YOUR_PERSONALIZATION_KV_ID", preview_id = "YOUR_PREVIEW_ID" }
]
```

Get KV IDs:
```bash
npx wrangler kv:namespace list
```

### Step 5: Commit and Push

```bash
git add .
git commit -m "Set up CI/CD pipeline"
git push origin main
```

**That's it!** GitHub Actions will automatically deploy.

---

## 📊 Workflows

### 1. Deploy to Production (`.github/workflows/deploy.yml`)

**Triggers:** Push to `main` branch

**Steps:**
1. Checkout code
2. Install dependencies
3. Build tracking pixel
4. Deploy Worker to Cloudflare
5. Deploy pixel to Cloudflare Pages
6. Post deployment summary

**Deployment time:** ~2-3 minutes

### 2. Test & Lint (`.github/workflows/test.yml`)

**Triggers:** Push to `main`, `develop`, or Pull Request

**Steps:**
1. Type checking (TypeScript)
2. Linting
3. Build pixel
4. Verify pixel size (<12KB)
5. Run tests

### 3. Deploy to Staging (`.github/workflows/staging.yml`)

**Triggers:** Push to `develop` or `staging` branch

**Steps:**
1. Build project
2. Deploy to staging environment
3. Uses staging secrets

---

## 🌿 Branch Strategy

```
main (production)
 ├─ Deploy automatically to production
 │  https://outbound-intent-engine.workers.dev
 │
develop (staging)
 ├─ Deploy automatically to staging
 │  https://staging.outbound-intent-engine.workers.dev
 │
feature/* (testing)
 └─ Run tests only (no deployment)
```

### Recommended Workflow

1. **Feature development:**
   ```bash
   git checkout -b feature/new-feature
   # Make changes
   git commit -m "Add new feature"
   git push origin feature/new-feature
   # Create Pull Request to develop
   ```

2. **Test in staging:**
   ```bash
   git checkout develop
   git merge feature/new-feature
   git push origin develop
   # Automatically deploys to staging
   ```

3. **Deploy to production:**
   ```bash
   git checkout main
   git merge develop
   git push origin main
   # Automatically deploys to production
   ```

---

## 📍 Viewing Deployments

### GitHub Actions Dashboard

1. Go to your repo → **Actions** tab
2. See all workflow runs
3. Click on a run to see logs
4. View deployment summary

### Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Workers & Pages** → Your worker
3. View deployments, logs, and analytics

---

## 🔍 Monitoring Deployments

### Check Deployment Status

**Badge in README:**
```markdown
![Deploy](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy.yml/badge.svg)
```

**CLI:**
```bash
# View recent deployments
gh run list --workflow=deploy.yml

# View logs for latest run
gh run view --log
```

### Worker Logs

```bash
# Stream live logs
npx wrangler tail

# View in dashboard
# Cloudflare Dashboard → Workers → Your worker → Logs
```

---

## 🚨 Troubleshooting

### Deployment Fails with "Unauthorized"

**Solution:** Check your `CLOUDFLARE_API_TOKEN`
```bash
# Test token locally
npx wrangler whoami
```

If fails, regenerate token in Cloudflare Dashboard.

### "Secrets not found" Error

**Solution:** Verify all required secrets are set in GitHub

1. Go to Settings → Secrets and variables → Actions
2. Verify all secrets from Step 3 are present
3. Check for typos in secret names

### BigQuery Credentials Invalid

**Solution:** Re-download service account JSON

1. Google Cloud Console → IAM & Admin → Service Accounts
2. Click your service account → Keys tab
3. Add Key → Create new key → JSON
4. Copy entire JSON contents to `BIGQUERY_CREDENTIALS` secret

### Pixel Size Too Large (>12KB)

**Solution:** Optimize build

```bash
# Check current size
npm run build:pixel
ls -lh dist/pixel.iife.js

# If too large, check vite.config.ts
# Ensure minification is enabled
```

### Worker Deployment Succeeds But Doesn't Work

**Solution:** Check worker logs
```bash
npx wrangler tail

# Then trigger an event and watch logs
```

Common issues:
- Missing KV namespace IDs in wrangler.toml
- Wrong BigQuery credentials
- ALLOWED_ORIGINS doesn't include your domain

---

## 🔒 Security Best Practices

### Rotate Secrets Regularly

```bash
# Rotate API token quarterly
# Cloudflare Dashboard → API Tokens → Roll token

# Update in GitHub
# Settings → Secrets → CLOUDFLARE_API_TOKEN → Update
```

### Use Environment-Specific Credentials

- ✅ Separate service accounts for staging and production
- ✅ Different BigQuery projects/datasets
- ✅ Separate KV namespaces

### Audit Access

```bash
# Review who has access to secrets
# GitHub → Settings → Collaborators & teams

# Review Cloudflare audit log
# Cloudflare Dashboard → Audit Log
```

---

## 🎯 Advanced Configuration

### Deploy Only on Tags

Update `.github/workflows/deploy.yml`:

```yaml
on:
  push:
    tags:
      - 'v*'  # Deploy only on version tags (v1.0.0, v1.1.0, etc.)
```

Usage:
```bash
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0
```

### Manual Deployment Trigger

Add to workflow:

```yaml
on:
  workflow_dispatch:  # Allows manual trigger from Actions tab
  push:
    branches:
      - main
```

### Deploy Multiple Workers

Update workflow to deploy multiple services:

```yaml
- name: Deploy tracking worker
  run: npx wrangler deploy src/worker/index.ts

- name: Deploy redirect worker
  run: npx wrangler deploy src/redirect/index.ts
```

### Deployment Notifications

Add Slack notification:

```yaml
- name: Notify Slack
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
  if: always()
```

---

## 📊 Deployment Metrics

Monitor these metrics:

**GitHub Actions:**
- Build time (should be <2 min)
- Success rate (target: >95%)
- Deployment frequency

**Cloudflare:**
- Worker CPU time
- Request count
- Error rate
- P99 latency

**BigQuery:**
- Event insertion lag
- Query costs
- Storage growth

---

## ✅ Verification Checklist

After setting up CI/CD:

- [ ] All secrets added to GitHub
- [ ] wrangler.toml configured with KV IDs
- [ ] Push to main triggers deployment
- [ ] Deployment completes successfully
- [ ] Worker is accessible at URL
- [ ] Pixel is deployed to Pages/CDN
- [ ] Test event reaches BigQuery
- [ ] Logs are visible in Cloudflare
- [ ] Set up deployment notifications (optional)

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Wrangler Action](https://github.com/cloudflare/wrangler-action)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers)
- [CI/CD Best Practices](https://docs.github.com/en/actions/deployment/about-deployments/deploying-with-github-actions)

---

## 🎉 You're All Set!

Your CI/CD pipeline is configured. Every push to main will automatically:
1. ✅ Build the project
2. ✅ Run tests
3. ✅ Deploy to Cloudflare
4. ✅ Be live in ~2 minutes

**Next Steps:**
1. Make a change to the code
2. Push to main
3. Watch it deploy automatically in the Actions tab
4. Verify it's live at your Worker URL

---

**Questions?** See [DEPLOYMENT.md](DEPLOYMENT.md) or open an issue.

