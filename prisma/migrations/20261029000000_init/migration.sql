-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AUCTIONEER', 'BIDDER');

-- CreateEnum
CREATE TYPE "BookCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditOperationalState" AS ENUM ('PENDING', 'READY', 'INCONCLUSIVE', 'COMPROMISED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('DEPOSIT', 'AUCTION_DEBIT', 'AUCTION_CREDIT');

-- CreateEnum
CREATE TYPE "WalletHoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CAPTURED');

-- CreateEnum
CREATE TYPE "SettlementResult" AS ENUM ('SOLD', 'UNSOLD');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "total_cents" BIGINT NOT NULL DEFAULT 0,
    "reserved_cents" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "lot_id" UUID,
    "settlement_id" UUID,
    "type" "WalletTransactionType" NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "balance_after_cents" BIGINT NOT NULL,
    "idempotency_record_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_holds" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "current_bid_id" UUID,
    "amount_cents" BIGINT NOT NULL DEFAULT 0,
    "status" "WalletHoldStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallet_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "external_key" VARCHAR(150) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "authors" JSONB NOT NULL,
    "publisher" VARCHAR(250),
    "publication_year" INTEGER,
    "source_snapshot" JSONB NOT NULL,
    "cover_local_path" TEXT,
    "description" TEXT NOT NULL,
    "condition" "BookCondition" NOT NULL,
    "starting_bid_cents" BIGINT NOT NULL,
    "minimum_increment_cents" BIGINT NOT NULL,
    "current_bid_cents" BIGINT,
    "current_leader_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "original_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "effective_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "LotStatus" NOT NULL,
    "audit_state" "AuditOperationalState" NOT NULL DEFAULT 'PENDING',
    "genesis_hash" CHAR(64),
    "bid_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_participants" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "public_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "bidder_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "previous_hash" CHAR(64) NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "idempotency_record_id" UUID,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_settlements" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "winner_id" UUID,
    "winning_bid_id" UUID,
    "final_amount_cents" BIGINT,
    "result" "SettlementResult" NOT NULL,
    "settled_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auction_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "public_token" VARCHAR(43) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "operation" VARCHAR(50) NOT NULL,
    "key" VARCHAR(36) NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PENDING',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_lot_id_idx" ON "wallet_transactions"("lot_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_settlement_id_idx" ON "wallet_transactions"("settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_current_bid_id_key" ON "wallet_holds"("current_bid_id");

-- CreateIndex
CREATE INDEX "wallet_holds_lot_id_idx" ON "wallet_holds"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_wallet_id_lot_id_key" ON "wallet_holds"("wallet_id", "lot_id");

-- CreateIndex
CREATE INDEX "lots_status_effective_ends_at_idx" ON "lots"("status", "effective_ends_at");

-- CreateIndex
CREATE INDEX "lots_seller_id_created_at_idx" ON "lots"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "lots_starts_at_idx" ON "lots"("starts_at");

-- CreateIndex
CREATE INDEX "lots_effective_ends_at_idx" ON "lots"("effective_ends_at");

-- CreateIndex
CREATE INDEX "lots_audit_state_idx" ON "lots"("audit_state");

-- CreateIndex
CREATE UNIQUE INDEX "lot_participants_lot_id_user_id_key" ON "lot_participants"("lot_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lot_participants_lot_id_public_number_key" ON "lot_participants"("lot_id", "public_number");

-- CreateIndex
CREATE UNIQUE INDEX "bids_idempotency_record_id_key" ON "bids"("idempotency_record_id");

-- CreateIndex
CREATE INDEX "bids_bidder_id_accepted_at_idx" ON "bids"("bidder_id", "accepted_at");

-- CreateIndex
CREATE INDEX "bids_lot_id_amount_cents_idx" ON "bids"("lot_id", "amount_cents");

-- CreateIndex
CREATE UNIQUE INDEX "bids_lot_id_sequence_key" ON "bids"("lot_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "auction_settlements_lot_id_key" ON "auction_settlements"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_settlements_winning_bid_id_key" ON "auction_settlements"("winning_bid_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_lot_id_key" ON "receipts"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_settlement_id_key" ON "receipts"("settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_public_token_key" ON "receipts"("public_token");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actor_user_id_operation_key_key" ON "idempotency_records"("actor_user_id", "operation", "key");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "auction_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_idempotency_record_id_fkey" FOREIGN KEY ("idempotency_record_id") REFERENCES "idempotency_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_current_bid_id_fkey" FOREIGN KEY ("current_bid_id") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_current_leader_id_fkey" FOREIGN KEY ("current_leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_participants" ADD CONSTRAINT "lot_participants_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_participants" ADD CONSTRAINT "lot_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "lot_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_idempotency_record_id_fkey" FOREIGN KEY ("idempotency_record_id") REFERENCES "idempotency_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_settlements" ADD CONSTRAINT "auction_settlements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_settlements" ADD CONSTRAINT "auction_settlements_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_settlements" ADD CONSTRAINT "auction_settlements_winning_bid_id_fkey" FOREIGN KEY ("winning_bid_id") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "auction_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants not expressible in Prisma schema
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_total_nonnegative" CHECK ("total_cents" >= 0);
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_reserved_nonnegative" CHECK ("reserved_cents" >= 0);
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_reserved_within_total" CHECK ("reserved_cents" <= "total_cents");
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_balance_nonnegative" CHECK ("balance_after_cents" >= 0);
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_amount_nonnegative" CHECK ("amount_cents" >= 0);
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_status_amount" CHECK (("status" = 'ACTIVE' AND "amount_cents" > 0) OR ("status" IN ('RELEASED', 'CAPTURED') AND "amount_cents" = 0));
ALTER TABLE "lots" ADD CONSTRAINT "lots_starting_bid_positive" CHECK ("starting_bid_cents" > 0);
ALTER TABLE "lots" ADD CONSTRAINT "lots_increment_positive" CHECK ("minimum_increment_cents" > 0);
ALTER TABLE "lots" ADD CONSTRAINT "lots_dates_valid" CHECK ("starts_at" < "original_ends_at" AND "effective_ends_at" >= "original_ends_at");
ALTER TABLE "lots" ADD CONSTRAINT "lots_counters_nonnegative" CHECK ("bid_count" >= 0 AND "version" >= 0);
ALTER TABLE "lot_participants" ADD CONSTRAINT "lot_participants_number_positive" CHECK ("public_number" > 0);
ALTER TABLE "bids" ADD CONSTRAINT "bids_sequence_positive" CHECK ("sequence" > 0);
ALTER TABLE "bids" ADD CONSTRAINT "bids_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "auction_settlements" ADD CONSTRAINT "settlement_result_fields" CHECK (("result" = 'SOLD' AND "winner_id" IS NOT NULL AND "winning_bid_id" IS NOT NULL AND "final_amount_cents" > 0) OR ("result" = 'UNSOLD' AND "winner_id" IS NULL AND "winning_bid_id" IS NULL AND "final_amount_cents" IS NULL));
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_response_state" CHECK (("status" = 'PENDING' AND "response_status" IS NULL AND "response_body" IS NULL) OR ("status" IN ('CONFIRMED', 'FAILED') AND "response_status" IS NOT NULL));
CREATE UNIQUE INDEX "wallet_transactions_settlement_type_unique" ON "wallet_transactions" ("settlement_id", "type") WHERE "settlement_id" IS NOT NULL AND "type" IN ('AUCTION_DEBIT', 'AUCTION_CREDIT');

