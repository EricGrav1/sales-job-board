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
      "Missing required environment variables: DATABASE_URL, SESSION_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, RESEND_API_KEY, APP_URL, ADMIN_EMAIL"
    );
  });
});
