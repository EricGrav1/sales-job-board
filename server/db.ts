import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema";
import { getEnv } from "./config/env";

const { Pool } = pg;

const env = getEnv();

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export const db = drizzle(pool, { schema });

export async function closeDb() {
  await pool.end();
}
