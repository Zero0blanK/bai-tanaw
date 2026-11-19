-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "result" JSONB;

-- CreateIndex
CREATE INDEX "jobs_created_by_created_at_idx" ON "jobs"("created_by", "created_at");
