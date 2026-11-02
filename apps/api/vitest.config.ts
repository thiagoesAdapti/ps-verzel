import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      AUDIT_ANCHOR_DIR: "./data/audit/test-anchors",
      COVER_STORAGE_DIR: "./data/covers/test"
    }
  }
});
