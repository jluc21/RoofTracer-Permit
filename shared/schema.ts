import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  uuid, 
  integer, 
  numeric, 
  date, 
  timestamp, 
  jsonb, 
  pgEnum 
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Platform enum for source tracking
export const sourcePlatformEnum = pgEnum('source_platform', [
  'socrata',
  'arcgis',
  'bulk',
  'etrakit',
  'citizenserve',
  'bsa',
  'mgo',
  'accela',
  'energov',
  'opengov',
  'smartgov',
  'cityview',
  'other'
]);

// Sources table - tracks data sources
export const sources = pgTable("sources", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  platform: sourcePlatformEnum("platform").notNull(),
  endpoint_url: text("endpoint_url").notNull(),
  config: jsonb("config").notNull().default({}), // API tokens, dataset IDs, etc.
  enabled: integer("enabled").notNull().default(1), // 1 = enabled, 0 = disabled
  schedule_cron: text("schedule_cron"), // cron expression for scheduling
  max_rows_per_run: integer("max_rows_per_run").default(1000),
  max_runtime_minutes: integer("max_runtime_minutes").default(30),
  max_requests_per_minute: integer("max_requests_per_minute").default(10),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Source state table - tracks ingestion state per source
export const sourceState = pgTable("source_state", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  source_id: integer("source_id").notNull().references(() => sources.id, { onDelete: 'cascade' }),
  last_max_timestamp: timestamp("last_max_timestamp"),
  last_max_objectid: integer("last_max_objectid"),
  last_issue_date: date("last_issue_date"),
  etag: text("etag"),
  checksum: text("checksum"),
  last_sync_at: timestamp("last_sync_at"),
  rows_fetched: integer("rows_fetched").default(0),
  rows_upserted: integer("rows_upserted").default(0),
  errors: integer("errors").default(0),
  freshness_seconds: integer("freshness_seconds"),
  
  // Progress tracking for live ingestion
  is_running: integer("is_running").default(0), // 1 = currently ingesting, 0 = idle
  status_message: text("status_message"), // "Launching browser...", "Scraping page 5...", etc.
  current_page: integer("current_page").default(0), // Current page being scraped
  
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// Permits table - BLDS-style normalized schema
export const permits = pgTable("permits", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Source tracking
  source_id: integer("source_id").notNull().references(() => sources.id, { onDelete: 'cascade' }),
  source_name: text("source_name").notNull(),
  source_platform: sourcePlatformEnum("source_platform").notNull(),
  source_record_id: text("source_record_id").notNull(),
  
  // Permit details
  permit_type: text("permit_type"),
  work_description: text("work_description"),
  permit_status: text("permit_status"),
  issue_date: date("issue_date"),
  
  // Address fields
  address_raw: text("address_raw"),
  address_parsed: jsonb("address_parsed"), // {house_number, street, city, state, zip}
  parcel_id: text("parcel_id"),
  
  // Contact info
  owner_name: text("owner_name"),
  contractor_name: text("contractor_name"),
  
  // Value
  permit_value: numeric("permit_value", { precision: 12, scale: 2 }),
  
  // Geospatial
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lon: numeric("lon", { precision: 10, scale: 7 }),
  geom_geojson: jsonb("geom_geojson"),
  
  // De-duplication
  fingerprint: text("fingerprint").notNull().unique(),
  
  // Roofing classification
  is_roofing: integer("is_roofing").notNull().default(0), // 1 = roofing, 0 = not roofing
  
  // Metadata
  ingest_ts: timestamp("ingest_ts").notNull().defaultNow(),
  provenance: jsonb("provenance").notNull(), // {platform, url, fetched_at, fields_map, checksum}
  raw_blob_path: text("raw_blob_path"),
});

// Relations
export const sourcesRelations = relations(sources, ({ many }) => ({
  permits: many(permits),
  state: many(sourceState),
}));

export const sourceStateRelations = relations(sourceState, ({ one }) => ({
  source: one(sources, {
    fields: [sourceState.source_id],
    references: [sources.id],
  }),
}));

export const permitsRelations = relations(permits, ({ one }) => ({
  source: one(sources, {
    fields: [permits.source_id],
    references: [sources.id],
  }),
}));

// Insert schemas
export const insertSourceSchema = createInsertSchema(sources).omit({
  id: true,
  created_at: true,
});

export const insertSourceStateSchema = createInsertSchema(sourceState).omit({
  id: true,
  updated_at: true,
});

export const insertPermitSchema = createInsertSchema(permits).omit({
  id: true,
  ingest_ts: true,
});

// Select types
export type Source = typeof sources.$inferSelect;
export type InsertSource = z.infer<typeof insertSourceSchema>;

export type SourceState = typeof sourceState.$inferSelect;
export type InsertSourceState = z.infer<typeof insertSourceStateSchema>;

export type Permit = typeof permits.$inferSelect;
export type InsertPermit = z.infer<typeof insertPermitSchema>;

// Frontend filter types
export const permitFilterSchema = z.object({
  bbox: z.string().optional(), // "west,south,east,north"
  city: z.string().optional(),
  state: z.string().optional(),
  type: z.string().optional(),
  date_from: z.string().optional(), // ISO date
  date_to: z.string().optional(), // ISO date
  roofing_only: z.boolean().optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
});

export type PermitFilter = z.infer<typeof permitFilterSchema>;

// Cluster response type
export const clusterPointSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.object({
    cluster: z.boolean(),
    cluster_id: z.number().optional(),
    point_count: z.number().optional(),
    permit_id: z.string().optional(),
    permit_type: z.string().optional(),
    address: z.string().optional(),
  }),
});

export type ClusterPoint = z.infer<typeof clusterPointSchema>;
