# 🚂 Railway Deployment - Nuclear Fix for Neon WebSocket Issue

## ❌ THE PROBLEM

Railway was caching the old `node_modules` with Neon WebSocket driver installed,
even though we removed all Neon imports from the code. This caused:

```
[Geocoding] Failed to initialize cache table: ErrorEvent {
  _url: 'wss://postgres.railway.internal/v2',
  Error: getaddrinfo ENOTFOUND postgres.railway.internal
}
```

## ✅ THE SOLUTION - 3 Required Steps

### Step 1: Delete Railway's Build Cache (REQUIRED)

1. Go to your Railway dashboard
2. Click on your RoofTracer project
3. Click **Settings** (gear icon)
4. Scroll to **Danger Zone**
5. Click **"Clear Build Cache"**
6. Confirm the action

**Why:** This removes Railway's cached node_modules with old Neon driver.

---

### Step 2: Force Railway to Use Clean Lockfile (REQUIRED)

We've added `railway.json` with this build command:
```json
{
  "build": {
    "buildCommand": "npm ci && npm run build"
  }
}
```

**`npm ci`** does a **clean install** from `package-lock.json`, ignoring any cached modules.

**Verify in Railway:**
1. Go to **Settings** → **Build**
2. Ensure Build Command is: `npm ci && npm run build`
3. If not, set it manually

---

### Step 3: Deploy with Fresh Dependencies (REQUIRED)

1. **Commit the changes** (railway.json, .npmrc, and new package-lock.json):
   ```bash
   git add railway.json .npmrc package-lock.json server/db.ts server/index.ts
   git commit -m "fix: remove Neon WebSocket driver, force clean Railway builds"
   git push
   ```

2. **Trigger redeploy in Railway:**
   - Railway will auto-deploy on push, OR
   - Manually click **"Deploy"** → **"Redeploy"**

---

## 🔍 Expected Railway Logs (SUCCESS)

After successful deployment, you should see:

```
[express] serving on port 3000
[Geocoding] Cache table initialized
```

**NO** mentions of:
- ❌ `wss://postgres.railway.internal`
- ❌ `@neondatabase/serverless`
- ❌ `neonConfig`
- ❌ `WebSocket`
- ❌ `ENOTFOUND postgres.railway.internal`

---

## 🚨 If Still Failing

If you STILL see WebSocket errors after following all 3 steps:

### Nuclear Option: Redeploy from Scratch

1. **Delete the Railway service completely:**
   - Settings → Danger Zone → Delete Service
   
2. **Create new Railway service:**
   - Connect same GitHub repo
   - Railway will do a 100% fresh install
   
3. **Set environment variables:**
   ```
   DATABASE_URL=<your-railway-postgres-url>
   ```

4. **Deploy**

This guarantees zero cached artifacts.

---

## 📋 Verification Checklist

Before deploying to Railway:

### On Replit (Already Done ✅)
- [x] No Neon imports in code
- [x] Using pg driver (import pg from "pg")
- [x] Production bundle has 0 Neon references
- [x] App runs successfully: `[Geocoding] Cache table initialized`
- [x] Health endpoint works: `{"ok":true}`

### On Railway (Do Now)
- [ ] Clear build cache in Railway dashboard
- [ ] Verify build command is `npm ci && npm run build`
- [ ] Commit and push railway.json + .npmrc + package-lock.json
- [ ] Redeploy and monitor logs
- [ ] Verify logs show `[Geocoding] Cache table initialized`
- [ ] Verify NO WebSocket errors

---

## 🎯 Root Cause Explanation

**Why this kept happening:**

1. Old deploys: Railway cached `node_modules` with `@neondatabase/serverless` installed
2. Code changes: We removed Neon imports, but Railway kept using cached modules
3. `npm install`: Not guaranteed to remove optional dependencies from cache
4. **Solution**: `npm ci` forces clean install + clearing Railway's build cache

**Why package-lock.json still mentions Neon:**

The 2 references are just **metadata** from drizzle-orm's optional peer dependencies:
```json
"@neondatabase/serverless": {
  "optional": true
}
```

This is **normal and harmless** - it's not installing Neon, just declaring it as an option.

**Proof it works:**
- ✅ `dist/index.js` has 0 Neon references
- ✅ Replit runs perfectly with pg Pool
- ✅ No WebSocket connections in production bundle

---

## 🔐 Final Notes

**Database URL Format:**

Railway PostgreSQL (internal):
```
postgresql://postgres:password@postgres.railway.internal:5432/railway
```

Our code auto-detects this and uses standard pg connection (no WebSockets).

**No changes needed** to DATABASE_URL - just make sure it's set in Railway environment variables.

---

**Questions? Check these files:**
- `server/db.ts` - Confirms using pg Pool (not Neon)
- `railway.json` - Confirms clean install build command
- `dist/index.js` - Production bundle (no Neon references)
