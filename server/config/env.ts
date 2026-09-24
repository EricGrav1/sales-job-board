import dotenv from "dotenv";
import { z } from "zod";

const dotenvPath = process.env.DOTENV_CONFIG_PATH;
dotenv.config(dotenvPath ? { path: dotenvPath, quiet: true } : { quiet: true });

const requiredEnvVars = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "RESEND_API_KEY",
  "APP_URL",
  "ADMIN_EMAIL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PREMIUM_PRICE_ID"
] as const;

const stripeVars = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PREMIUM_PRICE_ID", "STRIPE_LAUNCH_COUPON_ID"] as const;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  APP_URL: z.string().url(),
  ADMIN_EMAIL: z.string().email().transform((email) => email.toLowerCase()),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PREMIUM_PRICE_ID: z.string().min(1),
  STRIPE_LAUNCH_COUPON_ID: z.string().min(1).optional(),
  LAUNCH_PROMO_ENDS_AT: z.coerce.date().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000)
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const missing = requiredEnvVars.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const parsed = envSchema.safeParse({
    ...process.env,
    STRIPE_LAUNCH_COUPON_ID: process.env.STRIPE_LAUNCH_COUPON_ID?.trim() || undefined,
    LAUNCH_PROMO_ENDS_AT: process.env.LAUNCH_PROMO_ENDS_AT?.trim() || undefined,
    NODE_ENV: process.env.NODE_ENV ?? "development"
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }

  // Placeholders enable the dev billing fallback; in production they would silently hand out free credits.
  if (parsed.data.NODE_ENV === "production") {
    const placeholders = stripeVars.filter((key) => parsed.data[key]?.startsWith("placeholder"));
    if (placeholders.length > 0) {
      throw new Error(`Placeholder Stripe values are not allowed in production: ${placeholders.join(", ")}`);
    }
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetEnvForTests() {
  if (process.env.NODE_ENV === "test") {
    cachedEnv = undefined;
  }
}
