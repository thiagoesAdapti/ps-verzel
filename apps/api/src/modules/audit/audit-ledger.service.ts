import { mkdir, open, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { env } from "../../config/env.ts";
import { sha256 } from "../../shared/crypto.ts";
import { AppError } from "../../shared/errors.ts";
import { withKeyLock } from "../../shared/locks.ts";
import { canonical, signCanonical, verifyCanonical } from "./audit-crypto.ts";

export const ledgerTypes = ["GENESIS_PREPARE", "GENESIS_COMMIT", "BID_PREPARE", "BID_COMMIT", "ABORT"] as const;

const recordSchema = z.object({
  protocolVersion: z.literal("audit-v1"),
  type: z.enum(ledgerTypes),
  lotId: z.uuid(),
  operationId: z.uuid(),
  sequence: z.number().int().nonnegative(),
  commitment: z.string().regex(/^[a-f0-9]{64}$/),
  previousRecordHash: z.string().regex(/^[a-f0-9]{64}$/),
  recordedAt: z.iso.datetime(),
  signature: z.string().min(1),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/)
});

export type LedgerRecord = z.infer<typeof recordSchema>;

const ZERO = "0".repeat(64);

function safePath(lotId: string) {
  z.uuid().parse(lotId);
  const path = resolve(env.auditDir, `${lotId.toLowerCase()}.jsonl`);
  if (!path.startsWith(resolve(env.auditDir) + sep)) {
    throw new AppError("AUDIT_UNAVAILABLE", 503, "Ledger indisponível.");
  }
  return path;
}

export async function readLedger(lotId: string): Promise<LedgerRecord[]> {
  try {
    const text = await readFile(safePath(lotId), "utf8");
    if (text && !text.endsWith("\n")) throw new Error("truncated ledger");
    return text.split("\n").filter(Boolean).map((line) => recordSchema.parse(JSON.parse(line)));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new AppError("AUDIT_UNAVAILABLE", 503, "Não foi possível ler as provas de auditoria.");
  }
}

export async function appendLedger(
  input: Omit<LedgerRecord, "previousRecordHash" | "recordedAt" | "signature" | "recordHash">
) {
  return withKeyLock(`ledger:${input.lotId}`, async () => {
    await mkdir(env.auditDir, { recursive: true });
    const existing = await readLedger(input.lotId);
    const previousRecordHash = existing.at(-1)?.recordHash ?? ZERO;
    const recordedAt = new Date().toISOString();
    const signed = canonical([
      "audit-v1",
      input.type,
      input.lotId.toLowerCase(),
      input.operationId.toLowerCase(),
      input.sequence,
      input.commitment,
      previousRecordHash,
      recordedAt
    ]);
    const signature = signCanonical(signed);
    const recordHash = sha256(canonical([signed, signature]));
    const record: LedgerRecord = { ...input, previousRecordHash, recordedAt, signature, recordHash };
    const file = await open(safePath(input.lotId), "a");
    try {
      await file.write(`${JSON.stringify(record)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    return record;
  });
}

export function validateLedger(records: LedgerRecord[]) {
  let previous = ZERO;
  for (const record of records) {
    const signed = canonical([
      "audit-v1",
      record.type,
      record.lotId.toLowerCase(),
      record.operationId.toLowerCase(),
      record.sequence,
      record.commitment,
      record.previousRecordHash,
      record.recordedAt
    ]);
    if (
      record.previousRecordHash !== previous
      || !verifyCanonical(signed, record.signature)
      || sha256(canonical([signed, record.signature])) !== record.recordHash
    ) return false;
    previous = record.recordHash;
  }
  return true;
}
