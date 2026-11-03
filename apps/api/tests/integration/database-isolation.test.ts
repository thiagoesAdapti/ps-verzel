import { describe, expect, it } from "vitest";
import { assertDatabaseUrl, DATABASE_NAMES } from "../../../../scripts/database-safety.ts";

describe("destination database isolation", () => {
  it("accepts only the explicit database name for each environment", () => {
    for (const [target, name] of Object.entries(DATABASE_NAMES)) {
      expect(() => assertDatabaseUrl(`postgresql://local/${name}`, target as keyof typeof DATABASE_NAMES)).not.toThrow();
    }
  });

  it.each([
    ["development", "auction_house_dev"],
    ["test", "auction_house_test"],
    ["e2e", "auction_house_e2e"],
    ["production", "auction_house_entregavel_dev"]
  ] as const)("rejects source database %s/%s", (target, name) => {
    expect(() => assertDatabaseUrl(`postgresql://local/${name}`, target)).toThrow(/exclusivamente/);
  });
});
