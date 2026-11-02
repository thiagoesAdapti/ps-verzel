import { describe, expect, it } from "vitest";
import { withKeyLock } from "../../src/shared/locks.ts";

describe("keyed locks", () => {
  it("serializes work for the same key", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = withKeyLock("ledger", async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
    });
    const second = withKeyLock("ledger", async () => { order.push("second"); });
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("releases the key after an error", async () => {
    await expect(withKeyLock("failing", async () => { throw new Error("expected"); })).rejects.toThrow("expected");
    await expect(withKeyLock("failing", async () => "released")).resolves.toBe("released");
  });
});
