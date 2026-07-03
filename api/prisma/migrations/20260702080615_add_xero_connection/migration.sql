-- CreateTable
CREATE TABLE "xero_connections" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "xero_tenant_id" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_client_id_key" ON "xero_connections"("client_id");

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
