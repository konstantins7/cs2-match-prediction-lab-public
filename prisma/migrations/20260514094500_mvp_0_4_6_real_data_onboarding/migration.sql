-- MVP 0.4.6 Real Data Onboarding.
-- Additive lineage/cutoff fields for forecast-affecting real data records.

ALTER TABLE "PlayerStatSnapshot" ADD COLUMN "sourceMode" TEXT NOT NULL DEFAULT 'partial';
ALTER TABLE "PlayerStatSnapshot" ADD COLUMN "collectedAt" DATETIME;
ALTER TABLE "PlayerStatSnapshot" ADD COLUMN "sourceDate" DATETIME;
ALTER TABLE "PlayerStatSnapshot" ADD COLUMN "dataRole" TEXT NOT NULL DEFAULT 'pre_match_evidence';
ALTER TABLE "PlayerStatSnapshot" ADD COLUMN "dataLeakageCheckPassed" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "TeamFormSnapshot" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'generated';
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "sourceMode" TEXT NOT NULL DEFAULT 'partial';
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "matchId" TEXT;
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "importBatchId" TEXT;
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "sourceRecordId" TEXT;
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "collectedAt" DATETIME;
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "sourceDate" DATETIME;
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "dataRole" TEXT NOT NULL DEFAULT 'historical_team_form';
ALTER TABLE "TeamFormSnapshot" ADD COLUMN "dataLeakageCheckPassed" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "TeamMapStat" ADD COLUMN "sourceMode" TEXT NOT NULL DEFAULT 'partial';
ALTER TABLE "TeamMapStat" ADD COLUMN "collectedAt" DATETIME;
ALTER TABLE "TeamMapStat" ADD COLUMN "sourceDate" DATETIME;
ALTER TABLE "TeamMapStat" ADD COLUMN "dataRole" TEXT NOT NULL DEFAULT 'pre_match_evidence';
ALTER TABLE "TeamMapStat" ADD COLUMN "dataLeakageCheckPassed" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "VetoPattern" ADD COLUMN "sourceMode" TEXT NOT NULL DEFAULT 'partial';
ALTER TABLE "VetoPattern" ADD COLUMN "collectedAt" DATETIME;
ALTER TABLE "VetoPattern" ADD COLUMN "sourceDate" DATETIME;
ALTER TABLE "VetoPattern" ADD COLUMN "dataRole" TEXT NOT NULL DEFAULT 'pre_match_evidence';
ALTER TABLE "VetoPattern" ADD COLUMN "dataLeakageCheckPassed" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "HeadToHead" ADD COLUMN "sourceMode" TEXT NOT NULL DEFAULT 'partial';
ALTER TABLE "HeadToHead" ADD COLUMN "collectedAt" DATETIME;
ALTER TABLE "HeadToHead" ADD COLUMN "sourceDate" DATETIME;
ALTER TABLE "HeadToHead" ADD COLUMN "dataRole" TEXT NOT NULL DEFAULT 'pre_match_evidence';
ALTER TABLE "HeadToHead" ADD COLUMN "dataLeakageCheckPassed" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "NewsItem" ADD COLUMN "sourceDate" DATETIME;
ALTER TABLE "NewsItem" ADD COLUMN "dataRole" TEXT NOT NULL DEFAULT 'pre_match_evidence';
ALTER TABLE "NewsItem" ADD COLUMN "dataLeakageCheckPassed" BOOLEAN NOT NULL DEFAULT true;

UPDATE "PlayerStatSnapshot"
SET "sourceMode" = CASE
  WHEN "source" = 'manual_enrichment' THEN 'manual_real'
  WHEN "source" = 'parsed_demo' THEN 'parsed_demo'
  WHEN "source" = 'analyst_sample' THEN 'analyst_sample'
  WHEN "source" = 'grid' THEN 'grid_open_access'
  ELSE 'partial'
END,
"collectedAt" = COALESCE("collectedAt", "createdAt"),
"sourceDate" = COALESCE("sourceDate", "createdAt");

UPDATE "TeamMapStat"
SET "sourceMode" = CASE
  WHEN "source" = 'manual_enrichment' THEN 'manual_real'
  WHEN "source" = 'parsed_demo' THEN 'parsed_demo'
  WHEN "source" = 'analyst_sample' THEN 'analyst_sample'
  WHEN "source" = 'grid' THEN 'grid_open_access'
  ELSE 'partial'
END,
"collectedAt" = COALESCE("collectedAt", "createdAt"),
"sourceDate" = COALESCE("sourceDate", "createdAt");

UPDATE "VetoPattern"
SET "sourceMode" = CASE
  WHEN "source" = 'manual_enrichment' THEN 'manual_real'
  WHEN "source" = 'parsed_demo' THEN 'parsed_demo'
  WHEN "source" = 'analyst_sample' THEN 'analyst_sample'
  WHEN "source" = 'grid' THEN 'grid_open_access'
  ELSE 'partial'
END,
"collectedAt" = COALESCE("collectedAt", "createdAt"),
"sourceDate" = COALESCE("sourceDate", "createdAt");

UPDATE "HeadToHead"
SET "sourceMode" = CASE
  WHEN "source" = 'manual_enrichment' THEN 'manual_real'
  WHEN "source" = 'parsed_demo' THEN 'parsed_demo'
  WHEN "source" = 'analyst_sample' THEN 'analyst_sample'
  WHEN "source" = 'grid' THEN 'grid_open_access'
  ELSE 'partial'
END,
"collectedAt" = COALESCE("collectedAt", "date"),
"sourceDate" = COALESCE("sourceDate", "date");

UPDATE "NewsItem"
SET "sourceDate" = COALESCE("sourceDate", "publishedAt"),
"dataRole" = CASE WHEN "sourceMode" = 'analyst_sample' THEN 'post_match_analysis' ELSE 'pre_match_evidence' END;

UPDATE "TeamFormSnapshot"
SET "sourceDate" = COALESCE("sourceDate", "createdAt"),
"collectedAt" = COALESCE("collectedAt", "createdAt");

CREATE INDEX "PlayerStatSnapshot_dataRole_idx" ON "PlayerStatSnapshot"("dataRole");
CREATE INDEX "PlayerStatSnapshot_dataLeakageCheckPassed_idx" ON "PlayerStatSnapshot"("dataLeakageCheckPassed");

CREATE INDEX "TeamFormSnapshot_matchId_source_idx" ON "TeamFormSnapshot"("matchId", "source");
CREATE INDEX "TeamFormSnapshot_importBatchId_idx" ON "TeamFormSnapshot"("importBatchId");
CREATE INDEX "TeamFormSnapshot_dataRole_idx" ON "TeamFormSnapshot"("dataRole");
CREATE INDEX "TeamFormSnapshot_dataLeakageCheckPassed_idx" ON "TeamFormSnapshot"("dataLeakageCheckPassed");

CREATE INDEX "TeamMapStat_dataRole_idx" ON "TeamMapStat"("dataRole");
CREATE INDEX "TeamMapStat_dataLeakageCheckPassed_idx" ON "TeamMapStat"("dataLeakageCheckPassed");

CREATE INDEX "VetoPattern_dataRole_idx" ON "VetoPattern"("dataRole");
CREATE INDEX "VetoPattern_dataLeakageCheckPassed_idx" ON "VetoPattern"("dataLeakageCheckPassed");

CREATE INDEX "HeadToHead_dataRole_idx" ON "HeadToHead"("dataRole");
CREATE INDEX "HeadToHead_dataLeakageCheckPassed_idx" ON "HeadToHead"("dataLeakageCheckPassed");

CREATE INDEX "NewsItem_dataRole_idx" ON "NewsItem"("dataRole");
CREATE INDEX "NewsItem_dataLeakageCheckPassed_idx" ON "NewsItem"("dataLeakageCheckPassed");
