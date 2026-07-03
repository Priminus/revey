-- Rename tenant anchor from Clerk org to Clerk user (user-based tenancy).
ALTER TABLE "clients" RENAME COLUMN "clerk_org_id" TO "clerk_user_id";
ALTER INDEX "clients_clerk_org_id_key" RENAME TO "clients_clerk_user_id_key";
