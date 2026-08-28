-- Leads-only schema: WebsiteSkipped marker, remove website columns from Company

CREATE TABLE "WebsiteSkipped" (
    "company_number" TEXT NOT NULL,
    "company_name" TEXT,
    "website_url" TEXT,
    "website_source" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteSkipped_pkey" PRIMARY KEY ("company_number")
);

ALTER TABLE "ProcessingLog" DROP CONSTRAINT IF EXISTS "ProcessingLog_company_number_fkey";
ALTER TABLE "ProcessingLog" ADD COLUMN IF NOT EXISTS "company_name" TEXT;

-- Purge non-lead rows (companies that had websites stored)
DELETE FROM "ProcessingLog" WHERE "company_number" IN (
  SELECT "company_number" FROM "Company" WHERE "website" IS NOT NULL
);
DELETE FROM "Company" WHERE "website" IS NOT NULL;

ALTER TABLE "Company" DROP COLUMN IF EXISTS "website";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "website_confidence";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "website_source";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "website_last_checked";

ALTER TABLE "PipelineState" ADD COLUMN IF NOT EXISTS "companies_checked" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PipelineState" ADD COLUMN IF NOT EXISTS "companies_discarded" INTEGER NOT NULL DEFAULT 0;
