-- Keep ALL companies in one table with explicit website status.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website_status" TEXT DEFAULT 'PENDING';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website_url" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website_source" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website_confidence" TEXT;

-- Migrate rows from WebsiteSkipped into Company (if table exists).
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'WebsiteSkipped') THEN
    INSERT INTO "Company" (
      company_number, company_name, website_status, website_url, website_source,
      contact_status, processing_status, first_seen, last_checked, created_at, updated_at
    )
    SELECT
      ws.company_number,
      COALESCE(ws.company_name, ws.company_number),
      'WEBSITE_EXISTS',
      ws.website_url,
      ws.website_source,
      'NOT_APPLICABLE',
      'completed',
      ws.checked_at,
      ws.checked_at,
      ws.checked_at,
      ws.checked_at
    FROM "WebsiteSkipped" ws
    ON CONFLICT (company_number) DO UPDATE SET
      website_status = 'WEBSITE_EXISTS',
      website_url = EXCLUDED.website_url,
      website_source = EXCLUDED.website_source,
      contact_status = 'NOT_APPLICABLE',
      last_checked = EXCLUDED.last_checked,
      updated_at = NOW();

    DROP TABLE "WebsiteSkipped";
  END IF;
END $$;

-- Existing no-website leads get explicit status.
UPDATE "Company"
SET website_status = 'NO_WEBSITE'
WHERE website_status IS NULL OR website_status = 'PENDING';

-- Rename pipeline counter if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PipelineState' AND column_name = 'companies_discarded'
  ) THEN
    ALTER TABLE "PipelineState" RENAME COLUMN "companies_discarded" TO "companies_with_website";
  END IF;
END $$;
