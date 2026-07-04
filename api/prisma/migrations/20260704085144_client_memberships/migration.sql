-- CreateTable
CREATE TABLE "client_memberships" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_memberships_clerk_user_id_client_id_key" ON "client_memberships"("clerk_user_id", "client_id");

-- CreateIndex
CREATE INDEX "client_memberships_clerk_user_id_idx" ON "client_memberships"("clerk_user_id");

-- AddForeignKey
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
