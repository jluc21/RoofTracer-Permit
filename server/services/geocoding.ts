import { Pool } from '@neondatabase/serverless';

interface GeocodeResult {
  lat: number | null;
  lon: number | null;
  display_name?: string;
  error?: string;
}

interface CachedGeocode {
  address: string;
  lat: number | null;
  lon: number | null;
  geocoded_at: Date;
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'RoofTracer/1.0 (roofing permit mapping platform; contact via replit)';
const RATE_LIMIT_MS = 1100; // 1.1 seconds between requests (slightly over 1/sec for safety)

let lastRequestTime = 0;
const geocodeCache = new Map<string, GeocodeResult>();

export class GeocodingService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async initializeCacheTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS geocode_cache (
        address TEXT PRIMARY KEY,
        lat NUMERIC,
        lon NUMERIC,
        display_name TEXT,
        geocoded_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_geocode_cache_geocoded_at ON geocode_cache(geocoded_at);
    `;
    
    try {
      await this.pool.query(query);
      console.log('[Geocoding] Cache table initialized');
    } catch (error) {
      console.error('[Geocoding] Failed to initialize cache table:', error);
    }
  }

  private normalizeAddress(address: string): string {
    return address.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private async getCachedGeocode(address: string): Promise<GeocodeResult | null> {
    const normalized = this.normalizeAddress(address);
    
    // Check in-memory cache first
    if (geocodeCache.has(normalized)) {
      return geocodeCache.get(normalized)!;
    }

    // Check database cache
    try {
      const result = await this.pool.query(
        'SELECT lat, lon, display_name FROM geocode_cache WHERE address = $1',
        [normalized]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const cached: GeocodeResult = {
          lat: row.lat ? parseFloat(row.lat) : null,
          lon: row.lon ? parseFloat(row.lon) : null,
          display_name: row.display_name,
        };
        
        // Store in memory cache
        geocodeCache.set(normalized, cached);
        return cached;
      }
    } catch (error) {
      console.error('[Geocoding] Cache lookup error:', error);
    }

    return null;
  }

  private async setCachedGeocode(address: string, result: GeocodeResult): Promise<void> {
    const normalized = this.normalizeAddress(address);
    
    // Store in memory cache
    geocodeCache.set(normalized, result);

    // Store in database cache
    try {
      await this.pool.query(
        `INSERT INTO geocode_cache (address, lat, lon, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (address) DO UPDATE SET
           lat = EXCLUDED.lat,
           lon = EXCLUDED.lon,
           display_name = EXCLUDED.display_name,
           geocoded_at = NOW()`,
        [normalized, result.lat, result.lon, result.display_name || null]
      );
    } catch (error) {
      console.error('[Geocoding] Failed to cache result:', error);
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < RATE_LIMIT_MS) {
      const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();
  }

  async geocode(address: string, retries = 2): Promise<GeocodeResult> {
    console.log(`[Geocoding] geocode() called for: "${address}"`);
    
    if (!address || address.trim().length === 0) {
      console.log('[Geocoding] Empty address, returning null');
      return { lat: null, lon: null, error: 'Empty address' };
    }

    // Check cache first
    const cached = await this.getCachedGeocode(address);
    if (cached) {
      console.log(`[Geocoding] Cache hit for "${address}": lat=${cached.lat}, lon=${cached.lon}`);
      return cached;
    }

    console.log(`[Geocoding] Cache miss, calling Nominatim for "${address}"`);
    
    // Rate limiting
    await this.throttle();

    // Build query URL
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      addressdetails: '1',
      limit: '1',
    });

    const url = `${NOMINATIM_BASE_URL}/search?${params}`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 429 && retries > 0) {
          // Rate limited - wait longer and retry
          console.warn(`[Geocoding] Rate limited, retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          return this.geocode(address, retries - 1);
        }
        
        const error = `HTTP ${response.status}: ${response.statusText}`;
        console.error(`[Geocoding] Failed to geocode "${address}": ${error}`);
        const result: GeocodeResult = { lat: null, lon: null, error };
        await this.setCachedGeocode(address, result);
        return result;
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        const result: GeocodeResult = { 
          lat: null, 
          lon: null, 
          error: 'No results found' 
        };
        await this.setCachedGeocode(address, result);
        return result;
      }

      const location = data[0];
      const result: GeocodeResult = {
        lat: parseFloat(location.lat),
        lon: parseFloat(location.lon),
        display_name: location.display_name,
      };

      console.log(`[Geocoding] Success: "${address}" -> (${result.lat}, ${result.lon})`);
      await this.setCachedGeocode(address, result);
      return result;

    } catch (error) {
      if (retries > 0) {
        console.warn(`[Geocoding] Error, retrying: ${error}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.geocode(address, retries - 1);
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Geocoding] Failed to geocode "${address}": ${errorMsg}`);
      const result: GeocodeResult = { lat: null, lon: null, error: errorMsg };
      await this.setCachedGeocode(address, result);
      return result;
    }
  }

  async geocodeBatch(addresses: string[], progressCallback?: (index: number, total: number) => void): Promise<GeocodeResult[]> {
    const results: GeocodeResult[] = [];
    
    for (let i = 0; i < addresses.length; i++) {
      const result = await this.geocode(addresses[i]);
      results.push(result);
      
      if (progressCallback) {
        progressCallback(i + 1, addresses.length);
      }
    }
    
    return results;
  }

  getCacheStats(): { size: number } {
    return { size: geocodeCache.size };
  }

  clearMemoryCache(): void {
    geocodeCache.clear();
    console.log('[Geocoding] Memory cache cleared');
  }
}
