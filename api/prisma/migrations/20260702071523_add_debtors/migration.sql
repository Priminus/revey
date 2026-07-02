-- CreateTable
CREATE TABLE "debtors" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debtors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debtors_client_id_idx" ON "debtors"("client_id");

-- AddForeignKey
ALTER TABLE "debtors" ADD CONSTRAINT "debtors_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
