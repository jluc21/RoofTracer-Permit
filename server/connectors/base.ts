export interface RawRow {
  [key: string]: any;
}

export interface NormalizedPermit {
  source_id: number;
  source_name: string;
  source_platform: string;
  source_record_id: string;
  permit_type: string | null;
  work_description: string | null;
  permit_status: string | null;
  issue_date: string | null;
  address_raw: string | null;
  address_parsed: {
    house_number?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  parcel_id: string | null;
  owner_name: string | null;
  contractor_name: string | null;
  permit_value: number | null;
  lat: number | null;
  lon: number | null;
  geom_geojson: any | null;
  fingerprint: string;
  is_roofing: number;
  provenance: {
    platform: string;
    url: string;
    fetched_at: string;
    fields_map: { [key: string]: string };
    checksum?: string;
  };
  raw_blob_path: string | null;
}

export interface ConnectorConfig {
  endpoint_url: string;
  app_token?: string;
  dataset_id?: string;
  layer_id?: string;
  [key: string]: any;
}

export interface ConnectorState {
  last_max_timestamp?: string;
  last_max_objectid?: number;
  last_issue_date?: string;
  etag?: string;
  checksum?: string;
}

export interface Connector {
  validate(config: ConnectorConfig): Promise<void>;
  backfill(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit>;
  incremental(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit>;
}

// Rate limiting utility
export class RateLimiter {
  private requestTimes: number[] = [];
  private requestsPerMinute: number;

  constructor(requestsPerMinute: number) {
    this.requestsPerMinute = requestsPerMinute;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove requests older than 1 minute
    this.requestTimes = this.requestTimes.filter((time) => time > oneMinuteAgo);

    if (this.requestTimes.length >= this.requestsPerMinute) {
      // Calculate wait time
      const oldestRequest = this.requestTimes[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      // Clean up again after waiting
      const newNow = Date.now();
      const newOneMinuteAgo = newNow - 60000;
      this.requestTimes = this.requestTimes.filter((time) => time > newOneMinuteAgo);
    }

    this.requestTimes.push(Date.now());
  }
}

// Exponential backoff utility
export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw new Error('Unreachable');
}
