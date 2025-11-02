# RoofTracer Production Deployment Guide

## Overview

This guide covers deploying RoofTracer with **full Playwright browser automation** for live Accela permit scraping. Replit's NixOS environment currently lacks the system libraries required for Playwright, so production deployment requires a hosting platform with full Debian/Ubuntu system access.

---

## Recommended Hosting Options

### Option 1: Railway (Easiest)
**Best for:** Fast deployment with minimal configuration

- **Pros:** GitHub auto-deploy, built-in PostgreSQL, environment secrets, simple Dockerfile support
- **Cons:** Usage-based pricing (can be expensive at scale)
- **Setup Time:** 15 minutes
- **Cost:** $5-20/month for small-scale scraping

**Steps:**
1. Push codebase to GitHub
2. Create Railway project from GitHub repo
3. Add PostgreSQL database (Railway provisions Neon automatically)
4. Set environment variables (see below)
5. Deploy with Dockerfile (Railway auto-detects)

**Dockerfile Example:**
```dockerfile
FROM node:20-bullseye
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

---

### Option 2: Fly.io (Best Performance)
**Best for:** Low-latency global deployment, Docker expertise

- **Pros:** Global edge deployment, built-in PostgreSQL (via Supabase), great free tier
- **Cons:** Requires Docker knowledge, more manual configuration
- **Setup Time:** 30 minutes
- **Cost:** Free tier available, ~$5-15/month for production

**Steps:**
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `flyctl auth login`
3. Create app: `flyctl apps create rooftracer`
4. Provision Postgres: `flyctl postgres create`
5. Set secrets: `flyctl secrets set DATABASE_URL=...`
6. Deploy: `flyctl deploy`

**fly.toml:**
```toml
app = "rooftracer"
primary_region = "sjc"  # San Jose (close to Sacramento)

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 5000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1
```

---

### Option 3: Render.com (Balanced)
**Best for:** Simple Docker deployment without CLI complexity

- **Pros:** GitHub auto-deploy, managed PostgreSQL, simple web UI
- **Cons:** Slower cold starts on free tier
- **Setup Time:** 20 minutes
- **Cost:** Free tier available (with cold starts), $7-25/month for always-on

**Steps:**
1. Connect GitHub repo in Render dashboard
2. Select "Web Service" → Docker
3. Add PostgreSQL database (managed by Render)
4. Set environment variables in dashboard
5. Deploy (auto-builds from Dockerfile)

---

### Option 4: VPS (Hetzner/DigitalOcean) (Most Control)
**Best for:** Maximum control, cost optimization at scale

- **Pros:** Full server access, cheapest at scale, SSH access for debugging
- **Cons:** Manual setup, requires DevOps knowledge, no auto-scaling
- **Setup Time:** 1-2 hours
- **Cost:** $5-10/month for small VPS

**Steps:**
1. Provision Ubuntu 24.04 LTS VPS
2. Install Node.js 20: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -`
3. Install PostgreSQL: `sudo apt install postgresql postgresql-contrib`
4. Install Playwright dependencies: `npx playwright install-deps chromium`
5. Clone repo, set environment variables, run with PM2 or systemd
6. Configure Nginx reverse proxy for HTTPS (Let's Encrypt)

**PM2 Process Manager:**
```bash
npm install -g pm2
pm2 start npm --name "rooftracer" -- start
pm2 save
pm2 startup
```

---

## System Requirements

### Playwright Browser Dependencies
All hosting options must support these system packages (automatically handled by Debian/Ubuntu base images):

**Required Libraries:**
- `libglib2.0-0` (GLib core)
- `libnspr4`, `libnss3` (Network Security Services)
- `libdbus-1-3` (D-Bus message bus)
- `libatk1.0-0`, `libatk-bridge2.0-0` (Accessibility toolkit)
- `libx11-6`, `libxcb1`, `libxcomposite1`, `libxdamage1`, `libxext6`, `libxfixes3`, `libxrandr2` (X11 display libraries)
- `libxkbcommon0` (Keyboard handling)
- `libgbm1` (GPU buffer management)
- `libasound2` (Audio - required even for headless mode)
- `chromium` or `chromium-browser` (Playwright can bundle its own, but system Chromium reduces Docker image size)

**Install with Playwright:**
```bash
npx playwright install --with-deps chromium
```

**Dockerfile Best Practice:**
```dockerfile
FROM node:20-bullseye

# Install Playwright dependencies
RUN npx playwright install-deps chromium

# Continue with app setup...
```

---

## Environment Variables / Secrets

### Required Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/rooftracer` |
| `SESSION_SECRET` | Express session encryption key | Generate with `openssl rand -hex 32` |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (if not 5000) | `5000` |

### Optional Secrets (Future Enhancement)

| Variable | Description | Source |
|----------|-------------|--------|
| `ACCELA_USE_PLAYWRIGHT` | Enable live Accela scraping | Set to `true` for production |
| `SOCRATA_APP_TOKEN` | Socrata rate limit increase | Register at https://dev.socrata.com/ |
| `NOMINATIM_EMAIL` | Nominatim usage identification | Your email (Nominatim policy) |

### Setting Secrets

**Railway:**
```bash
railway variables set DATABASE_URL="postgresql://..."
railway variables set SESSION_SECRET="$(openssl rand -hex 32)"
```

**Fly.io:**
```bash
flyctl secrets set DATABASE_URL="postgresql://..."
flyctl secrets set SESSION_SECRET="$(openssl rand -hex 32)"
```

**Render:**
Use web dashboard → Environment → Add Secret File or Environment Variable

**VPS:**
Create `.env` file in project root (add to `.gitignore`):
```bash
DATABASE_URL=postgresql://...
SESSION_SECRET=abc123...
NODE_ENV=production
ACCELA_USE_PLAYWRIGHT=true
```

---

## Database Migration

### Initial Schema Setup

RoofTracer uses Drizzle ORM with automated schema push:

```bash
npm run db:push
```

This creates:
- `sources` - Data source configurations
- `source_state` - Ingestion tracking (last sync timestamps)
- `permits` - Permit records with geocoding
- `geocode_cache` - Nominatim response cache

### Production Best Practices

1. **Run migrations before first deploy:**
   ```bash
   DATABASE_URL="postgresql://..." npm run db:push
   ```

2. **Seed initial sources:**
   ```bash
   curl -X POST https://your-app.railway.app/api/sources \
     -H "Content-Type: application/json" \
     -d '{
       "source_name": "Sacramento County - Building Permits",
       "source_platform": "accela",
       "endpoint": "https://aca-prod.accela.com/SACRAMENTO",
       "config": {
         "agency_name": "Sacramento County",
         "base_url": "https://aca-prod.accela.com/SACRAMENTO",
         "module": "Building",
         "search_keywords": ["roof", "reroof", "re-roof"]
       },
       "enabled": true,
       "schedule_cron": null,
       "max_rows_per_run": 1000,
       "max_runtime_minutes": 30,
       "max_requests_per_minute": 10
     }'
   ```

3. **Verify database connectivity:**
   ```bash
   curl https://your-app.railway.app/api/health
   # Should return: {"status":"healthy","database":"connected","timestamp":"..."}
   ```

---

## Ingestion Runner Setup

### Manual Trigger via API

Trigger ingestion on-demand:
```bash
curl -X POST https://your-app.railway.app/api/sources/5/ingest \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

Response:
```json
{"message":"Ingestion started","source_id":5,"mode":"incremental"}
```

Check logs for progress:
```bash
# Railway
railway logs --tail

# Fly.io
flyctl logs

# Render
View in web dashboard → Logs

# VPS
pm2 logs rooftracer
```

### Scheduled Ingestion (Cron Jobs)

**Option A: Platform Cron (Railway/Render)**
Use built-in cron triggers:

Railway:
```yaml
# railway.toml
[[cron]]
schedule = "0 2 * * *"  # 2 AM daily
command = "curl -X POST http://localhost:5000/api/sources/5/ingest"
```

Render:
Use "Cron Jobs" feature in dashboard (separate service type)

**Option B: Node.js Cron (All Platforms)**
Add `node-cron` to run ingestion internally:

```bash
npm install node-cron
```

`server/scheduler.ts`:
```typescript
import cron from 'node-cron';

export function startScheduler() {
  // Run Sacramento County ingestion daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Scheduler] Starting Sacramento County ingestion...');
    try {
      await fetch('http://localhost:5000/api/sources/5/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false })
      });
    } catch (error) {
      console.error('[Scheduler] Ingestion failed:', error);
    }
  });

  // Run Lincoln ingestion daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('[Scheduler] Starting Lincoln ingestion...');
    // Similar fetch for source_id = 6
  });

  console.log('[Scheduler] Cron jobs initialized');
}
```

Import in `server/index.ts`:
```typescript
import { startScheduler } from './scheduler';

// After Express server starts
startScheduler();
```

**Option C: External Cron Service**
Use free services like **Cron-job.org** or **EasyCron** to hit your ingestion endpoint:

1. Register at https://cron-job.org/
2. Create job: `POST https://your-app.railway.app/api/sources/5/ingest`
3. Set schedule: `0 2 * * *` (2 AM daily)
4. Add header: `Content-Type: application/json`
5. Add body: `{"force": false}`

---

## Rate Limiting & Anti-Ban Strategies

### Nominatim Geocoding (1 req/sec limit)

**Built-in:** Already implemented in `server/services/geocoding.ts`:
- 1.1 second delay between requests (complies with Nominatim policy)
- Dual caching (in-memory + PostgreSQL) to minimize API calls
- User-Agent header identifies RoofTracer

**Best Practices:**
1. **Set NOMINATIM_EMAIL environment variable** (Nominatim policy for heavy usage):
   ```bash
   NOMINATIM_EMAIL=admin@rooftracer.com
   ```

2. **Monitor cache hit rate** in logs:
   ```
   [Geocoding] Cache hit for "700 H Street Sacramento CA"
   [Geocoding] Cache miss, calling Nominatim for "9283 Greenback Lane Orangevale CA"
   ```

3. **Consider self-hosting Nominatim** if geocoding >100K addresses:
   - Docker: https://github.com/mediagis/nominatim-docker
   - Change `NOMINATIM_BASE_URL` environment variable

### Accela Portal Scraping (Avoid IP Bans)

**Strategies:**
1. **Rate limit portal requests** (already configured):
   - Default: 10 requests/minute in `sources.max_requests_per_minute`
   - Lower to 6 req/min if you notice captchas or 429 errors

2. **Rotate User-Agents** (optional enhancement):
   ```typescript
   // server/connectors/accela.ts
   const userAgents = [
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
     'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
   ];
   const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
   ```

3. **Add random delays** between page navigation:
   ```typescript
   await page.waitForTimeout(Math.random() * 2000 + 1000); // 1-3 seconds
   ```

4. **Use residential proxies** for large-scale scraping:
   - Services: Bright Data, Oxylabs, Smartproxy
   - Configure in Playwright:
     ```typescript
     await chromium.launch({
       proxy: { server: 'http://proxy.example.com:8080' }
     });
     ```

5. **Respect robots.txt**:
   - Manually check `https://aca-prod.accela.com/robots.txt`
   - Ensure no `Disallow: /Cap/` rules exist

---

## Security Best Practices

### 1. Environment Secrets
- **Never commit `.env` files** to Git
- Use platform secret managers (Railway Secrets, Fly Secrets, etc.)
- Rotate `SESSION_SECRET` quarterly

### 2. Database Security
- **Use SSL/TLS connections** for PostgreSQL (Railway/Fly/Render enable by default)
- **Restrict database access** by IP (whitelist production server IPs)
- **Read-only replicas** for analytics (Neon/Supabase support this)

### 3. API Rate Limiting
- **Add Express rate limiter** to prevent abuse:
  ```bash
  npm install express-rate-limit
  ```
  ```typescript
  import rateLimit from 'express-rate-limit';

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // 100 requests per 15 min
  });

  app.use('/api/', apiLimiter);
  ```

### 4. HTTPS Enforcement
- Railway/Fly/Render auto-provision SSL certificates
- VPS: Use **Let's Encrypt** with Certbot:
  ```bash
  sudo certbot --nginx -d rooftracer.com
  ```

### 5. CORS Configuration
- Restrict origins in production:
  ```typescript
  import cors from 'cors';

  app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
      ? 'https://rooftracer.com' 
      : 'http://localhost:5173'
  }));
  ```

---

## Monitoring & Logging

### Application Logs

**Railway:**
```bash
railway logs --tail --filter="[Accela]"
```

**Fly.io:**
```bash
flyctl logs --app rooftracer | grep Geocoding
```

**Render:**
Use web dashboard → Logs (persistent for 7 days on paid plans)

**VPS (PM2):**
```bash
pm2 logs rooftracer --lines 100
pm2 monit  # Real-time monitoring
```

### Log Levels to Monitor

| Pattern | Severity | Action |
|---------|----------|--------|
| `[Accela] Browser automation error` | ERROR | Check Playwright dependencies |
| `[Geocoding] HTTP 429` | WARN | Nominatim rate limit - cached failures cleared automatically |
| `Ingestion failed for source` | ERROR | Check portal connectivity, review logs |
| `[Geocoding] Success` | INFO | Normal operation |
| `Ingestion completed for source` | INFO | Track permit counts |

### Error Tracking (Optional)

**Sentry Integration:**
```bash
npm install @sentry/node
```

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// Add to Express
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

### Database Monitoring

**Neon (Railway/Render default):**
- Dashboard shows active connections, query performance
- Enable query logging in settings

**Fly.io Postgres:**
```bash
flyctl postgres connect -a rooftracer-db
\dt+ # List tables with sizes
SELECT COUNT(*) FROM permits WHERE is_roofing = 1; # Check data
```

### Uptime Monitoring

**Free Services:**
- **UptimeRobot** (https://uptimerobot.com/) - 50 free monitors
- **Better Uptime** (https://betteruptime.com/) - 10 free monitors

**Setup:**
1. Create HTTP monitor for `https://your-app.railway.app/api/health`
2. Set check interval: 5 minutes
3. Configure email/SMS alerts on downtime

---

## Performance Optimization

### 1. Database Indexing
Verify indexes exist (already in schema):
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'permits';
```

Expected indexes:
- `permits_fingerprint_idx` (deduplication)
- `permits_is_roofing_idx` (roofing filter)
- `permits_lat_lon_idx` (bounding box queries)

### 2. Connection Pooling
Neon automatically pools connections. For VPS PostgreSQL:
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections
  idleTimeoutMillis: 30000,
});
```

### 3. CDN for Frontend Assets
Use Cloudflare CDN (free tier):
1. Point domain to Railway/Fly/Render
2. Enable Cloudflare proxy (orange cloud)
3. Cache static assets automatically

### 4. Gzip Compression
Already enabled in Express, verify in production:
```typescript
import compression from 'compression';
app.use(compression());
```

---

## Cost Estimates

| Platform | Free Tier | Small Scale (1K permits/day) | Large Scale (10K permits/day) |
|----------|-----------|-------------------------------|--------------------------------|
| **Railway** | $5 credit/month | $10-15/month | $30-50/month |
| **Fly.io** | 3 VMs free | $5-10/month | $20-35/month |
| **Render** | Free (with cold starts) | $7/month | $25/month |
| **Hetzner VPS** | No free tier | $5/month (CPX11) | $10/month (CPX21) |

**Additional Costs:**
- **PostgreSQL:** Included in Railway/Fly/Render free tier, $0-10/month for 1GB+ data
- **Playwright:** No cost (open source)
- **Nominatim:** Free (self-hosted or public API with rate limits)

---

## Deployment Checklist

### Pre-Deployment
- [ ] Test Accela connector locally with `ACCELA_USE_PLAYWRIGHT=true`
- [ ] Verify all environment variables are documented
- [ ] Run database migrations: `npm run db:push`
- [ ] Seed initial sources via API
- [ ] Test geocoding with 10+ real addresses

### Deployment
- [ ] Push codebase to GitHub
- [ ] Configure hosting platform (Railway/Fly/Render/VPS)
- [ ] Set environment secrets (DATABASE_URL, SESSION_SECRET, etc.)
- [ ] Deploy application
- [ ] Verify `/api/health` endpoint returns 200
- [ ] Trigger test ingestion: `POST /api/sources/5/ingest`

### Post-Deployment
- [ ] Monitor logs for errors (check for Playwright/Geocoding issues)
- [ ] Verify permits appear in database: `SELECT COUNT(*) FROM permits;`
- [ ] Test frontend map loads and displays permits
- [ ] Set up cron jobs for automated ingestion
- [ ] Configure uptime monitoring (UptimeRobot)
- [ ] Document production URLs and credentials in team wiki

---

## Troubleshooting

### Playwright Fails to Launch

**Error:** `browserType.launch: Host system is missing dependencies`

**Solution:**
- Ensure Dockerfile uses `RUN npx playwright install-deps chromium`
- Use Debian/Ubuntu base image (not Alpine)
- Check logs for specific missing libraries

### Geocoding Rate Limit Errors

**Error:** `[Geocoding] HTTP 429 Too Many Requests`

**Solution:**
- Verify 1.1 second rate limit is working (check timestamps in logs)
- Cache is now configured to NOT persist 429 errors (fixed in this session)
- Consider self-hosting Nominatim for unlimited requests

### Ingestion Returns 0 Permits

**Issue:** Accela search returns empty results

**Debugging:**
1. Test portal manually: Navigate to `https://aca-prod.accela.com/SACRAMENTO`
2. Check search keywords match portal's permit types
3. Review Playwright screenshots (enable in connector):
   ```typescript
   await page.screenshot({ path: 'debug-search.png' });
   ```
4. Verify HTML table structure matches parsing logic

### Database Connection Timeouts

**Error:** `Connection terminated unexpectedly`

**Solution:**
- Check DATABASE_URL is correct
- Verify firewall allows connections from production server IP
- Enable SSL mode: `DATABASE_URL=postgresql://...?sslmode=require`

---

## Next Steps

1. **Choose hosting platform** based on budget and DevOps experience
2. **Deploy RoofTracer** following platform-specific steps above
3. **Enable live Accela scraping** by setting `ACCELA_USE_PLAYWRIGHT=true`
4. **Test with Sacramento County** (source_id 5) and Lincoln (source_id 6)
5. **Monitor first 24 hours** of ingestion for errors
6. **Scale horizontally** by adding more data sources (Folsom, Rocklin, etc.)
7. **Consider premium features:**
   - Email alerts for new roofing permits in specific areas
   - Export to CSV/Excel for contractors
   - Historical trend analytics dashboard
   - Mobile app (React Native with same backend)

---

## Support & Resources

- **Playwright Docs:** https://playwright.dev/docs/intro
- **Drizzle ORM:** https://orm.drizzle.team/docs/overview
- **Nominatim API:** https://nominatim.org/release-docs/develop/api/Overview/
- **Railway Docs:** https://docs.railway.app/
- **Fly.io Docs:** https://fly.io/docs/
- **Render Docs:** https://render.com/docs

For issues specific to RoofTracer, check logs and review:
- `docs/accela-connector-guide.md` - Detailed Accela integration patterns
- `server/normalization/roofing_rules.yaml` - Classification rules
- `server/services/geocoding.ts` - Geocoding service implementation
