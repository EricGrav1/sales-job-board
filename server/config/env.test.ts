import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("environment validation", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("fails fast and lists missing required environment variables", async () => {
    vi.resetModules();
    process.env = {
      NODE_ENV: "test",
      DOTENV_CONFIG_PATH: "/private/tmp/sales-job-board-missing-env"
    };

    const { getEnv } = await import("./env");

    expect(() => getEnv()).toThrow(
      "Missing required environment variables: DATABASE_URL, SESSION_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, RESEND_API_KEY, APP_URL, ADMIN_EMAIL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PREMIUM_PRICE_ID"
    );
  });

  it("refuses placeholder Stripe values in production", async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "placeholder-stripe-secret-key",
      STRIPE_WEBHOOK_SECRET: "whsec_real",
      STRIPE_PREMIUM_PRICE_ID: "price_real"
    };

    const { getEnv } = await import("./env");

    expect(() => getEnv()).toThrow("Placeholder Stripe values are not allowed in production: STRIPE_SECRET_KEY");
  });

  it("allows placeholder Stripe values outside production", async () => {
    vi.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "development", STRIPE_SECRET_KEY: "placeholder-stripe-secret-key" };

    const { getEnv } = await import("./env");

    expect(getEnv().STRIPE_SECRET_KEY).toBe("placeholder-stripe-secret-key");
  });
});
