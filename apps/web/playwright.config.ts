import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { e2eRuntime } from "../../scripts/e2e-environment.ts";

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const quote = (value: string) =>
  process.platform === "win32"
    ? `"${value.replaceAll('"', '""')}"`
    : `'${value.replaceAll("'", "'\\''")}'`;
const nodeCommand = (cli: string, args: string[]) =>
  [process.execPath, cli, ...args].map(quote).join(" ");
const apiCommand = nodeCommand(
  resolve(projectRoot, "node_modules/tsx/dist/cli.mjs"),
  [resolve(projectRoot, "apps/api/src/server.ts")]
);
const webCommand = nodeCommand(
  resolve(projectRoot, "node_modules/vite/bin/vite.js"),
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(e2eRuntime.webPort),
    "--strictPort"
  ]
);
const catalogCommand = nodeCommand(
  resolve(projectRoot, "node_modules/tsx/dist/cli.mjs"),
  [resolve(projectRoot, "scripts/open-library-e2e-server.ts")]
);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: e2eRuntime.webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" }
    }
  ],
  webServer: [
    {
      command: catalogCommand,
      cwd: projectRoot,
      env: e2eRuntime.catalogEnvironment,
      url: `${e2eRuntime.catalogOrigin}/health`,
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: apiCommand,
      cwd: projectRoot,
      env: e2eRuntime.apiEnvironment,
      url: `${e2eRuntime.apiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: webCommand,
      cwd: resolve(projectRoot, "apps/web"),
      env: e2eRuntime.webEnvironment,
      url: e2eRuntime.webOrigin,
      reuseExistingServer: false,
      timeout: 30_000
    }
  ]
});
