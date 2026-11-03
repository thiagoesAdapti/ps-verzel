import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { prisma, closeDatabase } from "../apps/api/src/config/database.ts";
import { env } from "../apps/api/src/config/env.ts";
import { createLot } from "../apps/api/src/modules/lots/lots.service.ts";
import { placeBid } from "../apps/api/src/modules/bids/bids.service.ts";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function solidPng(
  width: number,
  height: number,
  rgb: [number, number, number]
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk(
      "IDAT",
      deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))
    ),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

async function addCover(
  lotId: string,
  width: number,
  height: number,
  rgb: [number, number, number]
) {
  const filename = `${lotId}.png`;
  await mkdir(env.coverDir, { recursive: true });
  await writeFile(resolve(env.coverDir, filename), solidPng(width, height, rgb));
  await prisma.lot.update({
    where: { id: lotId },
    data: { coverLocalPath: filename }
  });
}

async function fixtureLot(input: {
  title: string;
  key: string;
  endsInMs: number;
  width: number;
  height: number;
  rgb: [number, number, number];
  sellerId: string;
}) {
  const lot = await createLot({
    sellerId: input.sellerId,
    book: {
      key: input.key,
      title: input.title,
      authors: ["Autor E2E"],
      publicationYear: 2026,
      publisher: "Editora E2E",
      coverId: null
    },
    description:
      "Exemplar exclusivo para validações visuais e funcionais do ambiente E2E.",
    condition: "GOOD",
    startingBidCents: 10_000n,
    minimumIncrementCents: 2_000n,
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + input.endsInMs)
  });
  await addCover(lot.id, input.width, input.height, input.rgb);
  return lot;
}

const expectedDatabase = "auction_house_entregavel_e2e";
if (
  env.NODE_ENV !== "e2e" ||
  new URL(env.databaseUrl).pathname !== `/${expectedDatabase}`
) {
  throw new Error(`Fixtures E2E recusadas fora do banco ${expectedDatabase}.`);
}

const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
  SELECT current_database()
`;
if (rows[0]?.current_database !== expectedDatabase) {
  throw new Error("Fixtures E2E recusadas: banco efetivamente conectado é inesperado.");
}

const seller = await prisma.user.findUniqueOrThrow({
  where: { email: "leiloeiro@casadeleiloes.local" }
});
const bidder = await prisma.user.findUniqueOrThrow({
  where: { email: "licitante1@casadeleiloes.local" }
});
const lightning = await fixtureLot({
  title: "The Lightning Thief",
  key: "e2e-lightning-thief",
  endsInMs: 7_200_000,
  width: 300,
  height: 500,
  rgb: [32, 86, 126],
  sellerId: seller.id
});
await placeBid({
  lotId: lightning.id,
  bidderId: bidder.id,
  amountCents: 10_000n,
  key: randomUUID()
});
await fixtureLot({
  title: "Quincas Borba",
  key: "e2e-quincas-borba",
  endsInMs: 33 * 3_600_000,
  width: 420,
  height: 640,
  rgb: [130, 83, 45],
  sellerId: seller.id
});
await fixtureLot({
  title: "Memórias póstumas de Brás Cubas",
  key: "e2e-memorias-postumas",
  endsInMs: 10_800_000,
  width: 640,
  height: 360,
  rgb: [92, 106, 74],
  sellerId: seller.id
});

console.log("Fixtures E2E obrigatórias criadas no banco isolado.");
await closeDatabase();
