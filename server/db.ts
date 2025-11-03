// Use standard pg driver instead of Neon WebSocket driver
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Auto-detect if SSL is needed (Railway, AWS RDS, Neon, etc.)
const needSSL =
  /\brailway\.app\b|amazonaws\.com\b|neon\.tech\b/i.test(process.env.DATABASE_URL || "");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needSSL ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
export default db;
