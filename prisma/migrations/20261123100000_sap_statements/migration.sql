ALTER TABLE "users" ADD COLUMN "employee_code" TEXT;
ALTER TABLE "users" ADD COLUMN "card_number" TEXT;

CREATE TABLE "card_statements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "file_id" UUID,
    "filename" TEXT NOT NULL,
    "account_name" TEXT,
    "account_number" TEXT,
    "period_label" TEXT,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "card_statement_lines" (
    "id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "posted_on" TIMESTAMP(3),
    "narrative" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "card_statements_user_id_idx" ON "card_statements"("user_id");
CREATE INDEX "card_statements_employee_id_idx" ON "card_statements"("employee_id");
CREATE INDEX "card_statement_lines_statement_id_idx" ON "card_statement_lines"("statement_id");
CREATE INDEX "card_statement_lines_transaction_id_idx" ON "card_statement_lines"("transaction_id");

ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_statements" ADD CONSTRAINT "card_statements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_statement_lines" ADD CONSTRAINT "card_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "card_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_statement_lines" ADD CONSTRAINT "card_statement_lines_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
