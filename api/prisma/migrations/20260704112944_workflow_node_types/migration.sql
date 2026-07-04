ALTER TABLE "reminder_steps" ALTER COLUMN "template_id" DROP NOT NULL;
ALTER TABLE "reminder_steps" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'reminder';
ALTER TABLE "reminder_steps" ADD COLUMN "config" JSONB;
