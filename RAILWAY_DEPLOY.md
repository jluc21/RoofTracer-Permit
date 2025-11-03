# Railway Deployment Verification Checklist

Use this checklist every time you deploy to Railway to ensure everything works correctly.

## Pre-Deployment Checklist

- [ ] Environment variables configured in Railway Dashboard → Variables
  - [ ] `ACCELA_USE_PLAYWRIGHT=true` (for Playwright scraping)
  - [ ] Database variables auto-set by PostgreSQL addon
  - [ ] `SESSION_SECRET` auto-generated
- [ ] Latest code committed to Git
- [ ] `.env` files excluded from Git (check `.gitignore`)
- [ ] Build scripts tested locally (`./build.sh` runs successfully)

## Deployment Steps

### Method 1: Git Push (Recommended for Code Changes)

```bash
# Commit your changes
git add .
git commit -m "feat: your change description"
git push
```

Railway will automatically detect and deploy.

### Method 2: Manual Redeploy (For Config Changes)

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click on your **RoofTracer** project
3. Click on your service
4. Go to **"Deployments"** tab
5. Find the most recent deployment
6. Click **three dots menu** (⋯) → **"Redeploy"**
7. Wait 5-10 minutes for Docker build

### Method 3: Clear Cache & Redeploy (If Frontend Not Updating)

1. Railway Dashboard → Your Service → **Settings**
2. Scroll to **"Danger Zone"**
3. Click **"Clear Build Cache"**
4. Go to **"Deployments"** tab and trigger redeploy

## Post-Deployment Verification

### 1. Check Build Logs ✓

In Railway Deployments tab, verify:
- [ ] Build started successfully
- [ ] Frontend build: `✓ Frontend build successful (1.4M)`
- [ ] Backend build: `✓ Backend build successful (72K)`
- [ ] No error messages in build output
- [ ] Deployment status shows "Success"

### 2. Test Application Access ✓

- [ ] Visit Railway URL (e.g., `https://your-app.railway.app`)
- [ ] Map loads without errors
- [ ] No JavaScript console errors (F12 → Console)
- [ ] Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)

### 3. Verify Admin Panel ✓

Navigate to `/sources` and check:
- [ ] All 6 data sources visible:
  - [ ] Austin, TX (Socrata) - with Sync/Backfill buttons
  - [ ] San Francisco, CA (Socrata) - with Sync/Backfill buttons
  - [ ] Boston, MA (Socrata) - with Sync/Backfill buttons
  - [ ] Seattle, WA (Socrata) - with Sync/Backfill buttons
  - [ ] Sacramento County (Accela) - with Sync/Backfill buttons
  - [ ] City of Lincoln (Accela) - with Sync/Backfill buttons
- [ ] **All sources show Sync and Backfill buttons** (not just Socrata)
- [ ] Pause/Play toggle buttons work
- [ ] No missing UI elements

### 4. Test Data Ingestion ✓

- [ ] Click "Backfill" on a Socrata source (Austin, SF, Boston, or Seattle)
- [ ] Toast notification appears: "Ingestion started"
- [ ] Wait 30-60 seconds
- [ ] Navigate to `/status` page
- [ ] Verify "Records" count increases
- [ ] Return to map and verify permits appear

### 5. Test Playwright Scraping ✓

- [ ] Click "Backfill" on Sacramento County or City of Lincoln
- [ ] Check Railway logs for Playwright activity
- [ ] Wait 2-5 minutes (Accela is slower)
- [ ] Verify records appear in `/status` page
- [ ] Confirm real addresses appear (not fixture data)

## Troubleshooting Common Issues

### Issue: Buttons Missing on Accela Sources

**Symptoms:** Sacramento/Lincoln cards shorter than others, missing Sync/Backfill buttons

**Solution:**
1. Clear Railway build cache (Settings → Danger Zone → Clear Build Cache)
2. Redeploy the service
3. Hard refresh browser (Ctrl+Shift+R)
4. Check build logs for `✓ Frontend build successful (1.4M)`

### Issue: Playwright Returns Fixture Data

**Symptoms:** Sacramento/Lincoln show generic permit data, not real addresses

**Solution:**
1. Verify `ACCELA_USE_PLAYWRIGHT=true` in Railway Variables
2. Redeploy after adding variable
3. Check Railway logs for `[Accela] Starting LIVE backfill`

### Issue: Build Fails

**Symptoms:** Deployment fails with build errors

**Solution:**
1. Check Railway deployment logs for error messages
2. Verify all dependencies in `package.json` are valid
3. Test build locally: `./build.sh`
4. Ensure PostgreSQL addon is connected

### Issue: Database Connection Error

**Symptoms:** App crashes on startup with database errors

**Solution:**
1. Verify PostgreSQL addon is provisioned
2. Check Variables tab has `DATABASE_URL`
3. Restart the service
4. Check logs for connection details

## Build Process Overview

The improved build process:
1. **Clears caches**: Removes `dist/`, `node_modules/.vite`, `.vite`
2. **Builds frontend**: Vite compiles React app to `dist/public/`
3. **Verifies frontend**: Checks `dist/public/index.html` exists
4. **Builds backend**: esbuild bundles Express server to `dist/index.js`
5. **Verifies backend**: Checks `dist/index.js` exists
6. **Starts app**: Runs `node dist/index.js`

Expected build output:
```
✓ Frontend build successful (1.4M)
✓ Backend build successful (72K)
Build complete! ✓
```

## Quick Links

- **Railway Dashboard**: https://railway.app/dashboard
- **Troubleshooting Guide**: See `replit.md` → Troubleshooting section
- **Local Testing**: Run `./build.sh` to test build locally
