-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "fingerprint" TEXT;

-- CreateIndex
CREATE INDEX "findings_target_id_fingerprint_idx" ON "findings"("target_id", "fingerprint");
