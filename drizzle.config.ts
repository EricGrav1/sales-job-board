import { defineConfig } from "drizzle-kit";
import { getEnv } from "./server/config/env";

const env = getEnv();

export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL
  }
});
