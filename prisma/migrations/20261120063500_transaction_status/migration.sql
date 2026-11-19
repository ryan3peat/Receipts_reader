ALTER TABLE "transactions" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'new';

CREATE INDEX "transactions_status_idx" ON "transactions"("status");
