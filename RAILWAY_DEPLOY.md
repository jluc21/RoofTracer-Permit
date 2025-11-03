# Railway Deployment Instructions

## Quick Redeploy Guide

After adding environment variables like `ACCELA_USE_PLAYWRIGHT=true`, you need to redeploy your application for the changes to take effect.

### Method 1: Manual Redeploy (Recommended)

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click on your **RoofTracer** project
3. Click on your service
4. Go to the **"Deployments"** tab
5. Find the most recent deployment
6. Click the **three dots menu** (⋯) on the right
7. Select **"Redeploy"**
8. Wait 5-10 minutes for the Docker build to complete

### Method 2: Trigger Via Git Push

If manual redeploy doesn't work, push a new commit:

```bash
# Make any small change (e.g., update this file)
git add .
git commit -m "feat: trigger Railway redeploy with Playwright env var"
git push
```

Railway will automatically detect the push and rebuild the Docker image.

## Verifying the Deployment

1. Wait for the build to complete (check the "Deployments" tab)
2. Visit your Railway URL + `/sources`
3. All 6 data sources should now show **Sync** and **Backfill** buttons
4. Click "Backfill" on Sacramento County or City of Lincoln to test Playwright scraping

## Troubleshooting

### Buttons Still Missing
- Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
- Check Railway build logs for errors
- Verify `ACCELA_USE_PLAYWRIGHT=true` is in Variables tab

### Build Fails
- Check Railway logs in the "Deployments" tab
- Look for Docker build errors or missing dependencies
- Ensure PostgreSQL addon is properly connected
