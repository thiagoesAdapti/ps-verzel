import { describe, expect, it } from "vitest";
import { cents, jsonMoney } from "../../src/shared/money.ts";

describe("money values", () => {
  it("accepts integer cents as bigint", () => expect(cents("12500")).toBe(12500n));
  it("rejects floating point input", () => expect(() => cents("12.50")).toThrow());
  it("rejects a value below the configured minimum", () => expect(() => cents("99", 100n)).toThrow());
  it("serializes bigint without precision loss", () => {
    expect(jsonMoney(9_007_199_254_740_993n)).toBe("9007199254740993");
  });
});
