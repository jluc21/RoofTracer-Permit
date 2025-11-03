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
  
  // Migration: Enable Sacramento/Lincoln sources for Playwright
  const { storage } = await import("./storage");
  const sacSources = await storage.getSources();
  const toEnable = sacSources.filter(s => 
    (s.name.includes('Sacramento County') || s.name.includes('Lincoln')) && s.enabled === 0
  );
  
  if (toEnable.length > 0) {
    console.log(`[migration] Enabling ${toEnable.length} Sacramento area sources...`);
    for (const source of toEnable) {
      await storage.updateSource(source.id, { enabled: 1 });
      console.log(`[migration] ✓ Enabled: ${source.name}`);
    }
  }
  
  const server = await registerRoutes(app);
  
  // Auto-backfill enabled sources on startup (background task)
  setImmediate(async () => {
    try {
      const { storage } = await import("./storage");
      const sources = await storage.getSources();
      const enabledSources = sources.filter(s => s.enabled);
      
      if (enabledSources.length > 0) {
        console.log(`[auto-backfill] Starting automatic backfill for ${enabledSources.length} enabled sources...`);
        
        for (const source of enabledSources) {
          // Check if this source has already been ingested
          const state = await storage.getSourceState(source.id);
          const hasData = state && state.rows_upserted && state.rows_upserted > 0;
          
          if (!hasData) {
            console.log(`[auto-backfill] Triggering backfill for: ${source.name}`);
            // Trigger backfill via internal API call
            const { runIngestion } = await import("./routes");
            setImmediate(async () => {
              try {
                await runIngestion(source.id, "backfill");
              } catch (error) {
                console.error(`[auto-backfill] Failed for ${source.name}:`, error);
              }
            });
          } else {
            console.log(`[auto-backfill] Skipping ${source.name} - already has ${state.rows_upserted} permits`);
          }
        }
      }
    } catch (error) {
      console.error("[auto-backfill] Error during automatic backfill:", error);
    }
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
