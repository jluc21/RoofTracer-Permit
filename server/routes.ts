import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SocrataConnector } from "./connectors/socrata";
import { ArcGISConnector } from "./connectors/arcgis";
import type { InsertPermit } from "@shared/schema";

// Application version
const APP_VERSION = "1.0.0";
const APP_START_TIME = Date.now();

export async function registerRoutes(app: Express): Promise<Server> {
  // Health endpoint
  app.get("/api/health", async (_req, res) => {
    try {
      // Test database connection by getting sources
      await storage.getSources();
      
      res.json({
        status: "healthy",
        version: APP_VERSION,
        uptime: Math.floor((Date.now() - APP_START_TIME) / 1000),
        database: "connected",
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        version: APP_VERSION,
        uptime: Math.floor((Date.now() - APP_START_TIME) / 1000),
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Version endpoint
  app.get("/api/version", (_req, res) => {
    res.json({ version: APP_VERSION });
  });

  // Status endpoint - per-source freshness
  app.get("/api/status", async (_req, res) => {
    try {
      const sources = await storage.getSources();
      const states = await storage.getAllSourceStates();

      const sourceStatuses = sources.map((source) => {
        const state = states.find((s) => s.source_id === source.id);

        return {
          source_id: source.id,
          source_name: source.name,
          platform: source.platform,
          last_sync: state?.last_sync_at ? state.last_sync_at.toISOString() : null,
          records_synced: state?.rows_upserted || 0,
          errors: state?.errors || 0,
          freshness_hours: state?.freshness_seconds
            ? Math.floor(state.freshness_seconds / 3600)
            : null,
        };
      });

      res.json(sourceStatuses);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get all sources
  app.get("/api/sources", async (_req, res) => {
    try {
      const sources = await storage.getSources();
      res.json(sources);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get all source states
  app.get("/api/sources/state", async (_req, res) => {
    try {
      const states = await storage.getAllSourceStates();
      res.json(states);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get single source
  app.get("/api/sources/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const source = await storage.getSource(id);

      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }

      res.json(source);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update source
  app.patch("/api/sources/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;

      const source = await storage.updateSource(id, updates);

      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }

      res.json(source);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Trigger ingestion for a source
  app.post("/api/sources/:id/ingest", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const mode = (req.query.mode as string) || "incremental";

      if (mode !== "backfill" && mode !== "incremental") {
        return res.status(400).json({ error: "Invalid mode. Use 'backfill' or 'incremental'" });
      }

      const source = await storage.getSource(id);
      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }

      if (!source.enabled) {
        return res.status(400).json({ error: "Source is disabled" });
      }

      // Run ingestion in background (non-blocking)
      setImmediate(async () => {
        try {
          await runIngestion(source.id, mode as "backfill" | "incremental");
        } catch (error) {
          console.error(`Ingestion failed for source ${source.id}:`, error);
        }
      });

      res.json({ message: "Ingestion started", source_id: id, mode });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get permits with filters
  app.get("/api/permits", async (req, res) => {
    try {
      const filters: any = {};

      // Parse bbox
      if (req.query.bbox) {
        const [west, south, east, north] = String(req.query.bbox)
          .split(",")
          .map(parseFloat);
        filters.bbox = { west, south, east, north };
      }

      // Other filters
      if (req.query.city) filters.city = String(req.query.city);
      if (req.query.state) filters.state = String(req.query.state);
      if (req.query.type) filters.type = String(req.query.type);
      if (req.query.date_from) filters.dateFrom = String(req.query.date_from);
      if (req.query.date_to) filters.dateTo = String(req.query.date_to);
      if (req.query.roofing_only === "true") filters.roofingOnly = true;

      // Pagination
      filters.limit = req.query.limit ? parseInt(String(req.query.limit)) : 100;
      filters.offset = req.query.offset ? parseInt(String(req.query.offset)) : 0;

      const result = await storage.getPermits(filters);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get single permit
  app.get("/api/permits/:id", async (req, res) => {
    try {
      const permit = await storage.getPermit(req.params.id);

      if (!permit) {
        return res.status(404).json({ error: "Permit not found" });
      }

      res.json(permit);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Ingestion runner
async function runIngestion(sourceId: number, mode: "backfill" | "incremental") {
  const source = await storage.getSource(sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const state = (await storage.getSourceState(sourceId)) || {
    source_id: sourceId,
    last_max_timestamp: undefined,
    last_max_objectid: undefined,
    last_issue_date: undefined,
    etag: undefined,
    checksum: undefined,
    last_sync_at: undefined,
    rows_fetched: 0,
    rows_upserted: 0,
    errors: 0,
    freshness_seconds: undefined,
    updated_at: new Date(),
  };

  let connector;
  if (source.platform === "socrata") {
    connector = new SocrataConnector(source.max_requests_per_minute || 10);
  } else if (source.platform === "arcgis") {
    connector = new ArcGISConnector(source.max_requests_per_minute || 10);
  } else if (source.platform === "accela") {
    const { AccelaConnector } = await import("./connectors/accela");
    connector = new AccelaConnector(source.max_requests_per_minute || 10);
  } else {
    throw new Error(`Unsupported platform: ${source.platform}`);
  }

  const maxRows = source.max_rows_per_run || 1000;
  const config = {
    endpoint_url: source.endpoint_url,
    ...(source.config as object),
  };

  let rowsFetched = 0;
  let rowsUpserted = 0;
  let errors = 0;
  let lastIssueDate: string | null = null;
  let lastTimestamp: string | null = null;

  const startTime = Date.now();

  try {
    const iterator =
      mode === "backfill"
        ? connector.backfill(sourceId, source.name, config, state, maxRows)
        : connector.incremental(sourceId, source.name, config, state, maxRows);

    for await (const normalized of iterator) {
      rowsFetched++;

      try {
        const permitData: InsertPermit = {
          source_id: normalized.source_id,
          source_name: normalized.source_name,
          source_platform: normalized.source_platform,
          source_record_id: normalized.source_record_id,
          permit_type: normalized.permit_type,
          work_description: normalized.work_description,
          permit_status: normalized.permit_status,
          issue_date: normalized.issue_date,
          address_raw: normalized.address_raw,
          address_parsed: normalized.address_parsed,
          parcel_id: normalized.parcel_id,
          owner_name: normalized.owner_name,
          contractor_name: normalized.contractor_name,
          permit_value: normalized.permit_value ? String(normalized.permit_value) : null,
          lat: normalized.lat ? String(normalized.lat) : null,
          lon: normalized.lon ? String(normalized.lon) : null,
          geom_geojson: normalized.geom_geojson,
          fingerprint: normalized.fingerprint,
          is_roofing: normalized.is_roofing,
          provenance: normalized.provenance,
          raw_blob_path: normalized.raw_blob_path,
        };

        await storage.upsertPermit(permitData);
        rowsUpserted++;

        // Track latest dates for incremental sync
        if (normalized.issue_date && (!lastIssueDate || normalized.issue_date > lastIssueDate)) {
          lastIssueDate = normalized.issue_date;
        }
      } catch (error) {
        errors++;
        console.error(`Error upserting permit:`, error);
      }
    }

    // Update source state
    const endTime = Date.now();
    const freshnessSeconds = Math.floor((endTime - startTime) / 1000);

    await storage.upsertSourceState({
      source_id: sourceId,
      last_max_timestamp: lastTimestamp || state.last_max_timestamp || null,
      last_max_objectid: state.last_max_objectid || null,
      last_issue_date: lastIssueDate || state.last_issue_date || null,
      etag: state.etag || null,
      checksum: state.checksum || null,
      last_sync_at: new Date(),
      rows_fetched: rowsFetched,
      rows_upserted: rowsUpserted,
      errors: errors,
      freshness_seconds: freshnessSeconds,
    });

    console.log(
      `Ingestion completed for source ${sourceId}: ${rowsUpserted} permits upserted, ${errors} errors`
    );
  } catch (error) {
    console.error(`Ingestion failed for source ${sourceId}:`, error);
    throw error;
  }
}
