-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "cve_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "suggested_cvss_score" DOUBLE PRECISION,
ADD COLUMN     "suggested_cvss_vector" TEXT,
ADD COLUMN     "suggested_remediation" TEXT;
