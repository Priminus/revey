ALTER TABLE "debtors" ADD COLUMN "score_value" INTEGER;
ALTER TABLE "debtors" ADD COLUMN "score_band" TEXT;
ALTER TABLE "debtors" ADD COLUMN "recommended_action" TEXT;
ALTER TABLE "debtors" ADD COLUMN "score_rationale" TEXT;
ALTER TABLE "debtors" ADD COLUMN "scored_at" TIMESTAMP(3);

CREATE TABLE "debtor_interactions" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "debtor_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "debtor_interactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "debtor_interactions_client_id_idx" ON "debtor_interactions"("client_id");
CREATE INDEX "debtor_interactions_debtor_id_idx" ON "debtor_interactions"("debtor_id");
ALTER TABLE "debtor_interactions" ADD CONSTRAINT "debtor_interactions_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "outreach_drafts" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "debtor_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "to_email_intended" TEXT,
  "to_email_actual" TEXT,
  "score_value_at_draft" INTEGER,
  "error" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outreach_drafts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outreach_drafts_client_id_idx" ON "outreach_drafts"("client_id");
CREATE INDEX "outreach_drafts_status_idx" ON "outreach_drafts"("status");
CREATE INDEX "outreach_drafts_debtor_id_idx" ON "outreach_drafts"("debtor_id");
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
