import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.ts";
import {
  appendLedger,
  readLedger,
  validateLedger
} from "../../src/modules/audit/audit-ledger.service.ts";

const generatedFiles = new Set<string>();

function ledgerPath(lotId: string) {
  const path = resolve(env.auditDir, `${lotId}.jsonl`);
  generatedFiles.add(path);
  return path;
}

afterEach(async () => {
  await Promise.all([...generatedFiles].map((path) => rm(path, { force: true })));
  generatedFiles.clear();
});

describe("signed lot ledger", () => {
  it("returns an empty history for an absent valid lot", async () => {
    const lotId = randomUUID();
    ledgerPath(lotId);
    await expect(readLedger(lotId)).resolves.toEqual([]);
  });

  it("appends durable, signed, and chained JSONL records", async () => {
    const lotId = randomUUID();
    const path = ledgerPath(lotId);
    const commitment = "a".repeat(64);
    const first = await appendLedger({
      protocolVersion: "audit-v1",
      type: "GENESIS_PREPARE",
      lotId,
      operationId: randomUUID(),
      sequence: 0,
      commitment
    });
    const second = await appendLedger({
      protocolVersion: "audit-v1",
      type: "GENESIS_COMMIT",
      lotId,
      operationId: first.operationId,
      sequence: 0,
      commitment
    });

    const raw = await readFile(path, "utf8");
    const records = await readLedger(lotId);
    expect(raw.endsWith("\n")).toBe(true);
    expect(records).toHaveLength(2);
    expect(second.previousRecordHash).toBe(first.recordHash);
    expect(validateLedger(records)).toBe(true);

    records[1] = { ...records[1]!, signature: `${records[1]!.signature.slice(0, -1)}A` };
    expect(validateLedger(records)).toBe(false);
  });

  it("rejects traversal and maps truncated data to a controlled audit error", async () => {
    await expect(readLedger("../../outside")).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE", status: 503 });

    const lotId = randomUUID();
    const path = ledgerPath(lotId);
    await mkdir(env.auditDir, { recursive: true });
    await writeFile(path, "{\"truncated\":true}");
    await expect(readLedger(lotId)).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE", status: 503 });
  });
});
