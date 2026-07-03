CREATE TABLE "email_templates" (
  "id" TEXT NOT NULL,
  "client_id" TEXT,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_templates_client_id_idx" ON "email_templates"("client_id");

CREATE TABLE "reminder_flows" (
  "id" TEXT NOT NULL,
  "client_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reminder_flows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reminder_flows_client_id_key" ON "reminder_flows"("client_id");

CREATE TABLE "reminder_steps" (
  "id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "offset_days" INTEGER NOT NULL,
  "template_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_steps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reminder_steps_flow_id_idx" ON "reminder_steps"("flow_id");
ALTER TABLE "reminder_steps" ADD CONSTRAINT "reminder_steps_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "reminder_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_steps" ADD CONSTRAINT "reminder_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outreach_drafts" ADD COLUMN "template_id" TEXT;
ALTER TABLE "outreach_drafts" ADD COLUMN "step_offset_days" INTEGER;
