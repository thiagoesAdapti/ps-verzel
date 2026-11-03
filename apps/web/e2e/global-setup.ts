import {
  E2E_DATABASE_NAME,
  e2eRuntime
} from "../../../scripts/e2e-environment.ts";

export default function globalSetup() {
  if (new URL(e2eRuntime.databaseUrl).pathname !== `/${E2E_DATABASE_NAME}`) {
    throw new Error(`Playwright recusou um banco que não é ${E2E_DATABASE_NAME}.`);
  }
}
