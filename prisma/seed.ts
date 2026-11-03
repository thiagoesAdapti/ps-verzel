import { randomUUID } from "node:crypto";
import { prisma, closeDatabase } from "../apps/api/src/config/database.ts";
import { hashPassword } from "../apps/api/src/shared/crypto.ts";
import { createLot } from "../apps/api/src/modules/lots/lots.service.ts";
import { depositFunds } from "../apps/api/src/modules/wallets/wallets.service.ts";
import { placeBid } from "../apps/api/src/modules/bids/bids.service.ts";
import { settleLot } from "../apps/api/src/modules/auctions/settlement.service.ts";
import { env } from "../apps/api/src/config/env.ts";
import { confirmActiveDatabase } from "../scripts/database-safety.ts";

if (env.NODE_ENV === "production") {
  throw new Error("O seed demonstrativo e proibido em producao.");
}

await confirmActiveDatabase(env.databaseUrl, env.NODE_ENV);

const password = await hashPassword("Demo1234!");

async function ensureUser(
  email: string,
  name: string,
  role: "AUCTIONEER" | "BIDDER"
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      name,
      role,
      passwordHash: password,
      wallet: { create: { id: randomUUID() } }
    }
  });
}

const auctioneer = await ensureUser(
  "leiloeiro@casadeleiloes.local",
  "Helena Leiloeira",
  "AUCTIONEER"
);
const bidder1 = await ensureUser(
  "licitante1@casadeleiloes.local",
  "Ana Licitante",
  "BIDDER"
);
const bidder2 = await ensureUser(
  "licitante2@casadeleiloes.local",
  "Bruno Licitante",
  "BIDDER"
);

await depositFunds({
  userId: bidder1.id,
  amountCents: 500_000n,
  key: "11111111-1111-4111-8111-111111111111"
});
await depositFunds({
  userId: bidder2.id,
  amountCents: 500_000n,
  key: "22222222-2222-4222-8222-222222222222"
});

const now = Date.now();
const books = {
  scheduled: {
    key: "demo-scheduled",
    title: "Grande Sertão: Veredas",
    authors: ["João Guimarães Rosa"],
    publicationYear: 1956,
    publisher: "José Olympio",
    coverId: null
  },
  live: {
    key: "demo-live",
    title: "Dom Casmurro",
    authors: ["Machado de Assis"],
    publicationYear: 1899,
    publisher: "Garnier",
    coverId: null
  },
  ended: {
    key: "demo-ended",
    title: "Iracema",
    authors: ["José de Alencar"],
    publicationYear: 1865,
    publisher: "B. L. Garnier",
    coverId: null
  }
};

async function createDemoLot(
  book: typeof books.live,
  startsAt: Date,
  endsAt: Date,
  startingBidCents: bigint,
  minimumIncrementCents: bigint
) {
  return createLot({
    sellerId: auctioneer.id,
    book: { ...book, key: `${book.key}-${Date.now()}` },
    description:
      "Exemplar de demonstração em bom estado, com encadernação firme e páginas preservadas.",
    condition: "GOOD",
    startingBidCents,
    minimumIncrementCents,
    startsAt,
    endsAt
  });
}

async function activateStartedDemoLot<
  T extends { id: string; status: string; startsAt: Date }
>(lot: T) {
  if (lot.status !== "SCHEDULED" || lot.startsAt > new Date()) return lot;
  return prisma.lot.update({
    where: { id: lot.id },
    data: { status: "LIVE" }
  });
}

async function placeDemoBid(input: {
  lotId: string;
  bidderId: string;
  amountCents: bigint;
  key: string;
}) {
  // Um seed interrompido antes do lance pode deixar somente a intenção
  // idempotente como FAILED. Esse registro é descartável porque placeBid só
  // usa esse estado quando confirmou que nenhum lance foi persistido.
  await prisma.idempotencyRecord.deleteMany({
    where: {
      actorUserId: input.bidderId,
      operation: `BID:${input.lotId}`,
      key: input.key,
      status: "FAILED"
    }
  });
  return placeBid(input);
}

const scheduled = await prisma.lot.findFirst({
  where: {
    sellerId: auctioneer.id,
    externalKey: { startsWith: books.scheduled.key },
    status: "SCHEDULED",
    startsAt: { gt: new Date(now) },
    auditState: "READY"
  },
  orderBy: { startsAt: "desc" }
});
if (!scheduled) {
  await createDemoLot(
    books.scheduled,
    new Date(now + 86_400_000),
    new Date(now + 90_000_000),
    10_000n,
    1_000n
  );
}

const currentLive = await prisma.lot.findFirst({
  where: {
    sellerId: auctioneer.id,
    externalKey: { startsWith: books.live.key },
    status: "LIVE",
    effectiveEndsAt: { gt: new Date(now) },
    auditState: "READY"
  },
  orderBy: { effectiveEndsAt: "desc" }
});
const live = await activateStartedDemoLot(
  currentLive ??
    (await createDemoLot(
      books.live,
      new Date(now - 300_000),
      new Date(now + 3_600_000),
      10_000n,
      2_000n
    ))
);
if (live.status !== "ENDED") {
  await placeDemoBid({
    lotId: live.id,
    bidderId: bidder1.id,
    amountCents: 12_000n,
    key: "33333333-3333-4333-8333-333333333333"
  });
  await placeDemoBid({
    lotId: live.id,
    bidderId: bidder2.id,
    amountCents: 14_000n,
    key: "44444444-4444-4444-8444-444444444444"
  });
}

const existingEnded = await prisma.lot.findFirst({
  where: {
    sellerId: auctioneer.id,
    externalKey: { startsWith: books.ended.key },
    status: "ENDED"
  },
  orderBy: { createdAt: "desc" }
});
const ended = await activateStartedDemoLot(
  existingEnded ??
    (await createDemoLot(
      books.ended,
      new Date(now - 300_000),
      new Date(now + 1_800_000),
      18_000n,
      2_000n
    ))
);
if (ended.status !== "ENDED") {
  await placeDemoBid({
    lotId: ended.id,
    bidderId: bidder1.id,
    amountCents: 18_000n,
    key: "55555555-5555-4555-8555-555555555555"
  });
  await placeDemoBid({
    lotId: ended.id,
    bidderId: bidder2.id,
    amountCents: 20_000n,
    key: "66666666-6666-4666-8666-666666666666"
  });
  await prisma.lot.update({
    where: { id: ended.id },
    data: {
      effectiveEndsAt: new Date(now - 1_000),
      originalEndsAt: new Date(now - 1_000)
    }
  });
  await settleLot(ended.id);
}

console.log(
  "Seed concluído: 1 leiloeiro, 2 licitantes e lotes demonstrativos nos estados agendado, ao vivo e encerrado."
);
await closeDatabase();
