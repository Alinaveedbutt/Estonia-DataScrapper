-- CreateTable
CREATE TABLE "Company" (
    "company_number" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "date_of_creation" TIMESTAMP(3),
    "company_status" TEXT,
    "company_type" TEXT,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "locality" TEXT,
    "region" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "full_address" TEXT,
    "website" TEXT,
    "website_confidence" INTEGER DEFAULT 0,
    "website_source" TEXT,
    "website_last_checked" TIMESTAMP(3),
    "phone" TEXT,
    "phone_normalized" TEXT,
    "phone_source_url" TEXT,
    "phone_source_type" TEXT,
    "phone_confidence" TEXT,
    "phone_last_checked" TIMESTAMP(3),
    "phone_missing_reason" TEXT,
    "email" TEXT,
    "email_source_url" TEXT,
    "email_source_type" TEXT,
    "email_confidence" TEXT,
    "email_last_checked" TIMESTAMP(3),
    "email_missing_reason" TEXT,
    "contact_status" TEXT DEFAULT 'PENDING',
    "missing_reason" TEXT,
    "processing_status" TEXT DEFAULT 'pending',
    "enrichment_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_enrichment_attempt" TIMESTAMP(3),
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("company_number")
);

-- CreateTable
CREATE TABLE "ProcessingLog" (
    "id" TEXT NOT NULL,
    "company_number" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "source_url" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "last_successful_scan" TIMESTAMP(3),
    "last_attempted_scan" TIMESTAMP(3),
    "companies_processed" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessingLog_company_number_idx" ON "ProcessingLog"("company_number");

-- CreateIndex
CREATE INDEX "ProcessingLog_timestamp_idx" ON "ProcessingLog"("timestamp");

-- AddForeignKey
ALTER TABLE "ProcessingLog" ADD CONSTRAINT "ProcessingLog_company_number_fkey" FOREIGN KEY ("company_number") REFERENCES "Company"("company_number") ON DELETE RESTRICT ON UPDATE CASCADE;
