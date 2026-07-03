-- Enforce at most one global reminder flow (client_id IS NULL); Postgres nullable
-- unique indexes allow multiple NULLs, which let concurrent seeds create duplicates.
CREATE UNIQUE INDEX "reminder_flows_single_global" ON "reminder_flows" ((client_id IS NULL)) WHERE client_id IS NULL;
