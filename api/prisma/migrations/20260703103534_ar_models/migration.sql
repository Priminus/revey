-- Debtor: add Xero linkage + email + updated_at
ALTER TABLE "debtors" ADD COLUMN "xero_contact_id" TEXT;
ALTER TABLE "debtors" ADD COLUMN "email" TEXT;
ALTER TABLE "debtors" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "debtors" SET "xero_contact_id" = "id" WHERE "xero_contact_id" IS NULL;
ALTER TABLE "debtors" ALTER COLUMN "xero_contact_id" SET NOT NULL;
CREATE UNIQUE INDEX "debtors_client_id_xero_contact_id_key" ON "debtors"("client_id", "xero_contact_id");

-- Invoice
CREATE TABLE "invoices" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "debtor_id" TEXT NOT NULL,
  "xero_invoice_id" TEXT NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "issue_date" TIMESTAMP(3) NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "amount_due_cents" INTEGER NOT NULL,
  "amount_paid_cents" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "currency_code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_client_id_xero_invoice_id_key" ON "invoices"("client_id", "xero_invoice_id");
CREATE INDEX "invoices_client_id_idx" ON "invoices"("client_id");
CREATE INDEX "invoices_debtor_id_idx" ON "invoices"("debtor_id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
