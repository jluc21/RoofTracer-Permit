import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "./db";
import { initializeDatabase } from "./db-init";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database schema and seed sources
  await initializeDatabase();
  
  // Migration: Disable Accela sources (Playwright broken), Enable ArcGIS sources
  const { storage } = await import("./storage");
  const allSources = await storage.getSources();
  
  // DISABLE all Accela sources (Playwright version mismatch in production)
  const accelaToDisable = allSources.filter(s => s.platform === 'accela' && s.enabled === 1);
  if (accelaToDisable.length > 0) {
    console.log(`[migration] Disabling ${accelaToDisable.length} Accela sources (Playwright broken)...`);
    for (const source of accelaToDisable) {
      await storage.updateSource(source.id, { enabled: 0 });
      console.log(`[migration] ✓ Disabled: ${source.name}`);
    }
  }
  
  // ENABLE Sacramento area ArcGIS sources
  const arcgisToEnable = allSources.filter(s => 
    s.platform === 'arcgis' && 
    (s.name.includes('Sacramento') || s.name.includes('Placer')) && 
    s.enabled === 0
  );
  if (arcgisToEnable.length > 0) {
    console.log(`[migration] Enabling ${arcgisToEnable.length} ArcGIS sources...`);
    for (const source of arcgisToEnable) {
      await storage.updateSource(source.id, { enabled: 1 });
      console.log(`[migration] ✓ Enabled: ${source.name}`);
    }
  }
  
  const server = await registerRoutes(app);
  
  // Continuous auto-backfill loop - runs enabled sources until exhausted, then repeats
  setImmediate(async () => {
    const { storage } = await import("./storage");
    const { runIngestion } = await import("./routes");
    
    // Background loop that continuously backfills enabled sources
    const runContinuousBackfill = async () => {
      while (true) {
        try {
          const sources = await storage.getSources();
          const enabledSources = sources.filter(s => s.enabled);
          
          if (enabledSources.length > 0) {
            console.log(`[auto-backfill] Starting continuous backfill sweep for ${enabledSources.length} enabled sources...`);
            
            for (const source of enabledSources) {
              const maxRows = source.max_rows_per_run || 50000;
              let consecutiveZeroSaves = 0;
              const MAX_CONSECUTIVE_ZERO_SAVES = 3; // Stop after 3 full batches with 0 new permits
              
              while (true) {
                // Get current permit count for logging
                const beforeCount = await storage.getSourcePermitCount(source.id);
                
                // Run a backfill batch
                console.log(`[auto-backfill] Running backfill for: ${source.name}`);
                try {
                  await runIngestion(source.id, "backfill");
                } catch (error) {
                  console.error(`[auto-backfill] Failed for ${source.name}:`, error);
                  // Wait 30 seconds and retry same source
                  await new Promise(resolve => setTimeout(resolve, 30 * 1000));
                  continue; // Retry same source after error
                }
                
                // Check source state to see how many rows were FETCHED from API (not just saved after dedup)
                const state = await storage.getSourceState(source.id);
                const rowsFetched = state?.rows_fetched || 0;
                const rowsUpserted = state?.rows_upserted || 0;
                const afterCount = await storage.getSourcePermitCount(source.id);
                const permitsAdded = afterCount - beforeCount;
                
                console.log(`[auto-backfill] ${source.name}: Fetched ${rowsFetched}, saved ${permitsAdded} (${rowsUpserted - permitsAdded} duplicates), total: ${afterCount}`);
                
                // Track consecutive batches with zero new permits
                if (permitsAdded === 0 && rowsFetched >= maxRows) {
                  consecutiveZeroSaves++;
                  console.log(`[auto-backfill] ${source.name}: ${consecutiveZeroSaves}/${MAX_CONSECUTIVE_ZERO_SAVES} consecutive zero-save batches`);
                  
                  if (consecutiveZeroSaves >= MAX_CONSECUTIVE_ZERO_SAVES) {
                    console.log(`[auto-backfill] ${source.name} exhausted - ${MAX_CONSECUTIVE_ZERO_SAVES} consecutive batches with all duplicates`);
                    break; // Move to next source
                  }
                } else {
                  consecutiveZeroSaves = 0; // Reset if we saved any permits
                }
                
                // Source is exhausted if API returned fewer rows than maxRows (regardless of duplicates)
                if (rowsFetched < maxRows) {
                  console.log(`[auto-backfill] ${source.name} is up to date - API returned ${rowsFetched}/${maxRows} rows`);
                  break; // Move to next source
                }
                
                // Small delay between batches to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
            
            console.log(`[auto-backfill] Sweep complete. All enabled sources are up to date. Sleeping for 5 minutes...`);
          }
          
          // Sleep for 5 minutes before next sweep to check for new permits
          await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
          
        } catch (error) {
          console.error("[auto-backfill] Error during continuous backfill:", error);
          // Sleep for 1 minute on error before retrying
          await new Promise(resolve => setTimeout(resolve, 60 * 1000));
        }
      }
    };
    
    // Start the continuous backfill loop
    runContinuousBackfill();
  });

  // Health check endpoint
  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = Number(process.env.PORT) || 5000;

  function start(port: number) {
    const httpServer = server.listen(port, "0.0.0.0", () => {
      log(`[express] serving on port ${port}`);
    });

    httpServer.on("error", (err: any) => {
      if (err?.code === "EADDRINUSE") {
        const fallback = Math.floor(Math.random() * (5999 - 5100) + 5100);
        console.warn(`[express] Port ${port} in use. Retrying on ${fallback}...`);
        start(fallback);
      } else {
        throw err;
      }
    });

    const shutdown = async () => {
      console.log("[express] shutting down…");
      try { 
        await pool.end(); 
        console.log("[express] database pool closed");
      } catch (e) {
        console.error("[express] error closing pool:", e);
      }
      httpServer.close(() => {
        console.log("[express] server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  start(PORT);
})();
