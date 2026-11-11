ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'accounts';

ALTER TABLE "transactions" ADD COLUMN "submitted_by_id" UUID;
ALTER TABLE "files" ADD COLUMN "submitted_by_id" UUID;

UPDATE "transactions" SET "submitted_by_id" = "user_id" WHERE "submitted_by_id" IS NULL;
UPDATE "files" SET "submitted_by_id" = "user_id" WHERE "submitted_by_id" IS NULL;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "files_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "transactions_submitted_by_id_idx" ON "transactions"("submitted_by_id");
CREATE INDEX "files_submitted_by_id_idx" ON "files"("submitted_by_id");
