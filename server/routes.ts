import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SocrataConnector } from "./connectors/socrata";
import { ArcGISConnector } from "./connectors/arcgis";
import type { ConnectorState } from "./connectors/base";
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

  // Status endpoint - per-source freshness and database stats
  app.get("/api/status", async (_req, res) => {
    try {
      const sources = await storage.getSources();
      const states = await storage.getAllSourceStates();
      
      // Get total permit count
      const permitStats = await storage.getPermitStats();

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

      res.json({
        database: {
          total_permits: permitStats.total,
          permits_with_coords: permitStats.with_coords,
          roofing_permits: permitStats.roofing,
        },
        sources: sourceStatuses,
      });
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

      if (mode !== "backfill" && mode !== "incremental" && mode !== "deep") {
        return res.status(400).json({ error: "Invalid mode. Use 'backfill', 'incremental', or 'deep'" });
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
          if (mode === "deep") {
            await runDeepIngestion(source.id);
          } else {
            await runIngestion(source.id, mode as "backfill" | "incremental");
          }
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

  // TEMPORARY: Admin endpoint to add ArcGIS sources to production
  app.post("/api/admin/add-arcgis-sources", async (_req, res) => {
    try {
      const allSources = await storage.getSources();
      
      // Check if Sacramento County ArcGIS already exists
      const sacExists = allSources.some(s => 
        s.platform === 'arcgis' && s.name.includes('Sacramento County')
      );
      
      if (!sacExists) {
        console.log("[Admin] Adding Sacramento County ArcGIS source...");
        await storage.createSource({
          name: "Sacramento County - All Building Permits (ArcGIS)",
          platform: "arcgis",
          endpoint_url: "https://services5.arcgis.com/54falWtcpty3V47Z/arcgis/rest/services/Building_Permit_Data_pub/FeatureServer/0",
          config: { where_clause: "1=1" },
          enabled: 1,
          max_rows_per_run: 50000,
          max_runtime_minutes: 60,
        });
        console.log("[Admin] ✓ Added Sacramento County ArcGIS");
      }
      
      // Check if Placer County ArcGIS already exists
      const placerExists = allSources.some(s => 
        s.platform === 'arcgis' && s.name.includes('Placer County')
      );
      
      if (!placerExists) {
        console.log("[Admin] Adding Placer County ArcGIS source...");
        await storage.createSource({
          name: "Placer County, CA - Active Building Permits (ArcGIS)",
          platform: "arcgis",
          endpoint_url: "https://services1.arcgis.com/gqsWuDm3XrqZRdD1/arcgis/rest/services/BuildingPermits/FeatureServer/1",
          config: { where_clause: "PermitStatus = 'Active'" },
          enabled: 1,
          max_rows_per_run: 50000,
          max_runtime_minutes: 60,
        });
        console.log("[Admin] ✓ Added Placer County ArcGIS");
      }
      
      // Get updated sources
      const updatedSources = await storage.getSources();
      
      res.json({
        success: true,
        message: `ArcGIS sources added successfully. Total sources: ${updatedSources.length}`,
        sources: updatedSources.map(s => ({
          id: s.id,
          name: s.name,
          platform: s.platform,
          enabled: s.enabled === 1,
        })),
      });
    } catch (error) {
      console.error("[Admin] Failed to add ArcGIS sources:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Ingestion runner
export async function runIngestion(sourceId: number, mode: "backfill" | "incremental") {
  const source = await storage.getSource(sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const dbState = await storage.getSourceState(sourceId);
  
  // Convert database state to ConnectorState (Date -> string)
  const state: ConnectorState = {
    last_max_timestamp: dbState?.last_max_timestamp?.toISOString(),
    last_max_objectid: dbState?.last_max_objectid ?? undefined,
    last_issue_date: dbState?.last_issue_date ?? undefined,
    etag: dbState?.etag ?? undefined,
    checksum: dbState?.checksum ?? undefined,
  };

  let connector;
  if (source.platform === "socrata") {
    connector = new SocrataConnector(source.max_requests_per_minute || 10);
  } else if (source.platform === "arcgis") {
    connector = new ArcGISConnector(source.max_requests_per_minute || 10);
  } else if (source.platform === "accela") {
    const { AccelaConnector } = await import("./connectors/accela");
    connector = new AccelaConnector(source.max_requests_per_minute || 10);
  } else if (source.platform === "etrakit") {
    const { eTRAKiTConnector } = await import("./connectors/etrakit");
    connector = new eTRAKiTConnector(source.max_requests_per_minute || 10);
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
  let maxObjectId: number | null = null;

  const startTime = Date.now();

  // Mark ingestion as running
  await storage.upsertSourceState({
    source_id: sourceId,
    is_running: 1,
    status_message: mode === 'backfill' ? 'Starting backfill...' : 'Starting incremental sync...',
    current_page: 0,
  });

  try {
    const iterator =
      mode === "backfill"
        ? connector.backfill(sourceId, source.name, config, state, maxRows)
        : connector.incremental(sourceId, source.name, config, state, maxRows);

    for await (const normalized of iterator) {
      rowsFetched++;
      
      // Update progress every 10 permits
      if (rowsFetched % 10 === 0) {
        await storage.upsertSourceState({
          source_id: sourceId,
          is_running: 1,
          status_message: `Processing permits... (${rowsFetched} fetched, ${rowsUpserted} saved)`,
        });
      }

      try {
        const permitData: InsertPermit = {
          source_id: normalized.source_id,
          source_name: normalized.source_name,
          source_platform: normalized.source_platform as any,
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

        // Track latest dates and OBJECTID for incremental sync
        if (normalized.issue_date && (!lastIssueDate || normalized.issue_date > lastIssueDate)) {
          lastIssueDate = normalized.issue_date;
        }
        
        // Track max OBJECTID from provenance (ArcGIS sources)
        const provenanceObjectId = (normalized.provenance as any)?.max_objectid;
        if (provenanceObjectId && (!maxObjectId || provenanceObjectId > maxObjectId)) {
          maxObjectId = provenanceObjectId;
        }
      } catch (error) {
        errors++;
        console.error(`Error upserting permit:`, error);
      }
    }

    // Update source state - mark as complete
    const endTime = Date.now();
    const freshnessSeconds = Math.floor((endTime - startTime) / 1000);

    await storage.upsertSourceState({
      source_id: sourceId,
      last_max_timestamp: lastTimestamp || state.last_max_timestamp || null,
      last_max_objectid: maxObjectId || state.last_max_objectid || null,
      last_issue_date: lastIssueDate || state.last_issue_date || null,
      etag: state.etag || null,
      checksum: state.checksum || null,
      last_sync_at: new Date(),
      rows_fetched: rowsFetched,
      rows_upserted: rowsUpserted,
      errors: errors,
      freshness_seconds: freshnessSeconds,
      is_running: 0,
      status_message: `✓ Complete: ${rowsUpserted} permits ingested, ${errors} errors`,
      current_page: 0,
    });

    console.log(
      `Ingestion completed for source ${sourceId}: ${rowsUpserted} permits upserted, ${errors} errors`
    );
  } catch (error) {
    console.error(`Ingestion failed for source ${sourceId}:`, error);
    
    // Mark as failed
    await storage.upsertSourceState({
      source_id: sourceId,
      is_running: 0,
      status_message: `✗ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    throw error;
  }
}

// Deep ingestion - runs backfill in a loop until source is exhausted
export async function runDeepIngestion(sourceId: number) {
  const source = await storage.getSource(sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  console.log(`[Deep Backfill] Starting deep backfill for source ${sourceId}: ${source.name}`);
  
  let runCount = 0;
  let totalPermitsUpserted = 0;
  const maxRows = source.max_rows_per_run || 50000;

  try {
    // Loop until we get fewer permits than the batch size
    while (true) {
      runCount++;
      console.log(`[Deep Backfill] Run #${runCount} for source ${sourceId}`);
      
      const beforeCount = await storage.getSourcePermitCount(sourceId);
      
      // Run a single backfill batch
      await runIngestion(sourceId, "backfill");
      
      const afterCount = await storage.getSourcePermitCount(sourceId);
      const permitsAdded = afterCount - beforeCount;
      totalPermitsUpserted += permitsAdded;
      
      console.log(`[Deep Backfill] Run #${runCount}: Added ${permitsAdded} permits (total: ${totalPermitsUpserted})`);
      
      // If we got fewer permits than maxRows, we've exhausted the source
      if (permitsAdded < maxRows) {
        console.log(`[Deep Backfill] Source ${sourceId} exhausted after ${runCount} runs. Total: ${totalPermitsUpserted} permits`);
        break;
      }
      
      // Small delay between runs to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Update final status
    await storage.upsertSourceState({
      source_id: sourceId,
      status_message: `✓ Deep backfill complete: ${totalPermitsUpserted} total permits ingested in ${runCount} runs`,
    });
    
  } catch (error) {
    console.error(`[Deep Backfill] Failed for source ${sourceId}:`, error);
    
    await storage.upsertSourceState({
      source_id: sourceId,
      is_running: 0,
      status_message: `✗ Deep backfill failed after ${runCount} runs: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    throw error;
  }
}
