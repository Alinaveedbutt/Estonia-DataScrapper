-- Track Google CSE daily query usage on PipelineState
ALTER TABLE "PipelineState" ADD COLUMN IF NOT EXISTS "google_cse_queries_date" TEXT;
ALTER TABLE "PipelineState" ADD COLUMN IF NOT EXISTS "google_cse_queries_today" INTEGER NOT NULL DEFAULT 0;
