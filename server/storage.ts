// Referenced from javascript_database blueprint
import {
  sources,
  sourceState,
  permits,
  type Source,
  type InsertSource,
  type SourceState,
  type InsertSourceState,
  type Permit,
  type InsertPermit,
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { GeocodingService } from "./services/geocoding";

export interface IStorage {
  // Sources
  getSources(): Promise<Source[]>;
  getSource(id: number): Promise<Source | undefined>;
  createSource(source: InsertSource): Promise<Source>;
  updateSource(id: number, updates: Partial<InsertSource>): Promise<Source | undefined>;
  
  // Source State
  getSourceState(sourceId: number): Promise<SourceState | undefined>;
  getAllSourceStates(): Promise<SourceState[]>;
  upsertSourceState(state: InsertSourceState): Promise<SourceState>;
  
  // Permits
  getPermits(filters: {
    bbox?: { west: number; south: number; east: number; north: number };
    city?: string;
    state?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    roofingOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ permits: Permit[]; total: number }>;
  
  getPermit(id: string): Promise<Permit | undefined>;
  upsertPermit(permit: InsertPermit): Promise<Permit>;
  getPermitByFingerprint(fingerprint: string): Promise<Permit | undefined>;
  getPermitStats(): Promise<{ total: number; with_coords: number; roofing: number }>;
}

export class DatabaseStorage implements IStorage {
  // Sources
  async getSources(): Promise<Source[]> {
    return db.select().from(sources).orderBy(desc(sources.created_at));
  }

  async getSource(id: number): Promise<Source | undefined> {
    const [source] = await db.select().from(sources).where(eq(sources.id, id));
    return source || undefined;
  }

  async createSource(insertSource: InsertSource): Promise<Source> {
    const [source] = await db
      .insert(sources)
      .values(insertSource)
      .returning();
    return source;
  }

  async updateSource(id: number, updates: Partial<InsertSource>): Promise<Source | undefined> {
    const [source] = await db
      .update(sources)
      .set(updates)
      .where(eq(sources.id, id))
      .returning();
    return source || undefined;
  }

  // Source State
  async getSourceState(sourceId: number): Promise<SourceState | undefined> {
    const [state] = await db
      .select()
      .from(sourceState)
      .where(eq(sourceState.source_id, sourceId))
      .orderBy(desc(sourceState.updated_at))
      .limit(1);
    return state || undefined;
  }

  async getAllSourceStates(): Promise<SourceState[]> {
    // Get the most recent state for each source
    const states = await db
      .select()
      .from(sourceState)
      .orderBy(desc(sourceState.updated_at));
    
    // Deduplicate by source_id (keep most recent)
    const uniqueStates = new Map<number, SourceState>();
    for (const state of states) {
      if (!uniqueStates.has(state.source_id)) {
        uniqueStates.set(state.source_id, state);
      }
    }
    
    return Array.from(uniqueStates.values());
  }

  async upsertSourceState(state: InsertSourceState): Promise<SourceState> {
    // Check if state exists for this source
    const existing = await this.getSourceState(state.source_id);
    
    if (existing) {
      const [updated] = await db
        .update(sourceState)
        .set({ ...state, updated_at: new Date() })
        .where(eq(sourceState.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(sourceState)
        .values(state)
        .returning();
      return created;
    }
  }

  // Permits
  async getPermits(filters: {
    bbox?: { west: number; south: number; east: number; north: number };
    city?: string;
    state?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    roofingOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ permits: Permit[]; total: number }> {
    const conditions = [];

    // Bbox filter
    if (filters.bbox) {
      const { west, south, east, north } = filters.bbox;
      conditions.push(
        and(
          gte(permits.lon, sql`${west}`),
          lte(permits.lon, sql`${east}`),
          gte(permits.lat, sql`${south}`),
          lte(permits.lat, sql`${north}`)
        )
      );
    }

    // City filter (case-insensitive LIKE)
    if (filters.city) {
      conditions.push(
        sql`${permits.address_parsed}->>'city' ILIKE ${`%${filters.city}%`}`
      );
    }

    // State filter (exact match)
    if (filters.state) {
      conditions.push(
        sql`${permits.address_parsed}->>'state' = ${filters.state.toUpperCase()}`
      );
    }

    // Permit type filter (case-insensitive LIKE)
    if (filters.type) {
      conditions.push(
        sql`${permits.permit_type} ILIKE ${`%${filters.type}%`}`
      );
    }

    // Date range filters
    if (filters.dateFrom) {
      conditions.push(gte(permits.issue_date, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(permits.issue_date, filters.dateTo));
    }

    // Roofing only filter
    if (filters.roofingOnly) {
      conditions.push(eq(permits.is_roofing, 1));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(permits)
      .where(whereClause);

    const total = countResult?.count || 0;

    // Get permits with pagination
    const permitResults = await db
      .select()
      .from(permits)
      .where(whereClause)
      .orderBy(desc(permits.ingest_ts))
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);

    return { permits: permitResults, total };
  }

  async getPermit(id: string): Promise<Permit | undefined> {
    const [permit] = await db.select().from(permits).where(eq(permits.id, id));
    return permit || undefined;
  }

  async upsertPermit(permit: InsertPermit): Promise<Permit> {
    // Try to find existing permit by fingerprint
    const existing = await this.getPermitByFingerprint(permit.fingerprint);

    if (existing) {
      // Update existing permit
      const [updated] = await db
        .update(permits)
        .set(permit)
        .where(eq(permits.id, existing.id))
        .returning();
      return updated;
    } else {
      // Insert new permit
      const [created] = await db
        .insert(permits)
        .values(permit)
        .returning();
      return created;
    }
  }

  async getPermitByFingerprint(fingerprint: string): Promise<Permit | undefined> {
    const [permit] = await db
      .select()
      .from(permits)
      .where(eq(permits.fingerprint, fingerprint));
    return permit || undefined;
  }

  async getPermitStats(): Promise<{ total: number; with_coords: number; roofing: number }> {
    const [result] = await db
      .select({
        total: sql<number>`count(*)::int`,
        with_coords: sql<number>`count(*) FILTER (WHERE ${permits.lat} IS NOT NULL AND ${permits.lon} IS NOT NULL)::int`,
        roofing: sql<number>`count(*) FILTER (WHERE ${permits.is_roofing} = 1)::int`,
      })
      .from(permits);

    return {
      total: result?.total || 0,
      with_coords: result?.with_coords || 0,
      roofing: result?.roofing || 0,
    };
  }
}

export const storage = new DatabaseStorage();

// Initialize geocoding service
export const geocodingService = new GeocodingService(pool);

// Initialize geocoding cache table on startup
geocodingService.initializeCacheTable().catch(error => {
  console.error('Failed to initialize geocoding cache:', error);
});
