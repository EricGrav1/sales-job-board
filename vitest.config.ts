import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./server/test/setupEnv.ts"],
    globalSetup: ["./server/test/globalSetup.ts"],
    include: ["server/**/*.test.ts"],
    testTimeout: 30000
  }
});
