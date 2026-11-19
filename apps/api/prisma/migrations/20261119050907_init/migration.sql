-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ASSESSOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ScopeAssetType" AS ENUM ('HOST', 'URL', 'PORT_RANGE');

-- CreateEnum
CREATE TYPE "ScanTool" AS ENUM ('HTTP_CHECK', 'DNS', 'OPENAPI', 'NMAP', 'ZAP', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScanSource" AS ENUM ('WORKER', 'IMPORT');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ScanResultType" AS ENUM ('PORT', 'SERVICE', 'DNS_RECORD', 'ENDPOINT', 'ALERT', 'HEADER', 'COOKIE', 'CORS', 'REDIRECT');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('AUTHENTICATION', 'ACCESS_CONTROL', 'SECURITY_CONFIG');

-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('TOOL', 'AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'FALSE_POSITIVE', 'FIXED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('SCREENSHOT', 'HTTP_EXCHANGE', 'TOOL_OUTPUT');

-- CreateEnum
CREATE TYPE "AiTask" AS ENUM ('INTERPRET', 'REMEDIATE');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('RUN_CHECK', 'RUN_NMAP', 'RUN_ZAP', 'INTERPRET', 'REMEDIATE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by" UUID,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_id" UUID,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_targets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "description" TEXT,
    "authorization_note" TEXT,
    "test_window_start" TIMESTAMP(3),
    "test_window_end" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_rules" (
    "id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "asset_type" "ScopeAssetType" NOT NULL,
    "value" TEXT NOT NULL,
    "in_scope" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scope_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "tool" "ScanTool" NOT NULL,
    "source" "ScanSource" NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "params" JSONB,
    "raw_output_path" TEXT,
    "error" TEXT,
    "started_by" UUID,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_results" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "type" "ScanResultType" NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "scan_id" UUID,
    "title" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "affected_asset" TEXT NOT NULL,
    "source" "FindingSource" NOT NULL,
    "ai_severity" "Severity",
    "final_severity" "Severity",
    "cvss_vector" TEXT,
    "cvss_score" DOUBLE PRECISION,
    "owasp_top10" TEXT,
    "wstg_id" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'PENDING',
    "remediation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "scan_result_id" UUID,
    "type" "EvidenceType" NOT NULL,
    "file_path" TEXT,
    "content" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" UUID NOT NULL,
    "scan_id" UUID,
    "finding_id" UUID,
    "task" "AiTask" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_logs" (
    "id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "assessor_id" UUID,
    "old_status" "FindingStatus" NOT NULL,
    "new_status" "FindingStatus" NOT NULL,
    "notes" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "type" "JobType" NOT NULL,
    "ref_id" UUID NOT NULL,
    "bull_job_id" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'WAITING',
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failed_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "scope_rules_target_id_idx" ON "scope_rules"("target_id");

-- CreateIndex
CREATE INDEX "scans_target_id_created_at_idx" ON "scans"("target_id", "created_at");

-- CreateIndex
CREATE INDEX "scans_status_idx" ON "scans"("status");

-- CreateIndex
CREATE INDEX "scan_results_scan_id_type_idx" ON "scan_results"("scan_id", "type");

-- CreateIndex
CREATE INDEX "findings_target_id_status_idx" ON "findings"("target_id", "status");

-- CreateIndex
CREATE INDEX "findings_scan_id_idx" ON "findings"("scan_id");

-- CreateIndex
CREATE INDEX "evidence_finding_id_idx" ON "evidence"("finding_id");

-- CreateIndex
CREATE INDEX "ai_analyses_scan_id_idx" ON "ai_analyses"("scan_id");

-- CreateIndex
CREATE INDEX "ai_analyses_finding_id_idx" ON "ai_analyses"("finding_id");

-- CreateIndex
CREATE INDEX "ai_analyses_created_by_created_at_idx" ON "ai_analyses"("created_by", "created_at");

-- CreateIndex
CREATE INDEX "verification_logs_finding_id_idx" ON "verification_logs"("finding_id");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- CreateIndex
CREATE INDEX "jobs_ref_id_idx" ON "jobs"("ref_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "assessment_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_targets" ADD CONSTRAINT "assessment_targets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_rules" ADD CONSTRAINT "scope_rules_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "assessment_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "assessment_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_results" ADD CONSTRAINT "scan_results_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "assessment_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_scan_result_id_fkey" FOREIGN KEY ("scan_result_id") REFERENCES "scan_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_assessor_id_fkey" FOREIGN KEY ("assessor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
