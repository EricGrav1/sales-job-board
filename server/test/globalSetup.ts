import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Pool } = pg;

export default async function globalSetup() {
  const pool = new Pool({
    connectionString: "postgres://ericgrav1@localhost:5432/sales_job_board_test"
  });
  const db = drizzle(pool);

  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await migrate(db, { migrationsFolder: "drizzle" });
  await pool.end();
}
