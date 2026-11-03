import { randomUUID } from "node:crypto";
import { transaction } from "../../config/database.ts";
import { sha256 } from "../../shared/crypto.ts";
import { AppError } from "../../shared/errors.ts";

export async function depositFunds(input: { userId: string; amountCents: bigint; key: string }) {
  const digest = sha256(JSON.stringify(["DEPOSIT", input.amountCents.toString()]));
  return transaction(async (tx) => {
    const existing = await tx.idempotencyRecord.findUnique({
      where: {
        actorUserId_operation_key: {
          actorUserId: input.userId,
          operation: "DEPOSIT",
          key: input.key
        }
      }
    });
    if (existing) {
      if (existing.requestDigest !== digest) {
        throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta chave já foi usada em outra operação.");
      }
      if (existing.status === "CONFIRMED") return existing.responseBody;
      throw new AppError("AUDIT_PENDING", 423, "A operação anterior ainda está em processamento.");
    }

    const idemId = randomUUID();
    await tx.idempotencyRecord.create({
      data: {
        id: idemId,
        actorUserId: input.userId,
        operation: "DEPOSIT",
        key: input.key,
        requestDigest: digest,
        status: "PENDING"
      }
    });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id}::uuid FOR UPDATE`;
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { totalCents: { increment: input.amountCents } }
    });
    const transactionId = randomUUID();
    await tx.walletTransaction.create({
      data: {
        id: transactionId,
        walletId: wallet.id,
        type: "DEPOSIT",
        amountCents: input.amountCents,
        balanceAfterCents: updated.totalCents,
        idempotencyRecordId: idemId
      }
    });
    const response = {
      transactionId,
      totalCents: updated.totalCents.toString(),
      reservedCents: updated.reservedCents.toString(),
      availableCents: (updated.totalCents - updated.reservedCents).toString()
    };
    await tx.idempotencyRecord.update({
      where: { id: idemId },
      data: { status: "CONFIRMED", responseStatus: 201, responseBody: response }
    });
    return response;
  });
}
