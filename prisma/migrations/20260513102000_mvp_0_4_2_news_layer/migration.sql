-- MVP 0.4.2 News & Insider Intelligence Layer.
-- Additive/backward-compatible migration: existing NewsItem rows stay valid.

CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceTier" TEXT NOT NULL,
    "url" TEXT,
    "handle" TEXT,
    "platform" TEXT,
    "reliabilityBase" REAL NOT NULL DEFAULT 0.5,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "isInsider" BOOLEAN NOT NULL DEFAULT false,
    "isManualOnly" BOOLEAN NOT NULL DEFAULT true,
    "scrapingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "apiAllowed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "NewsImpactSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT,
    "newsItemIdsJson" TEXT NOT NULL,
    "totalImpact" REAL NOT NULL,
    "totalRisk" REAL NOT NULL,
    "confirmedImpact" REAL NOT NULL,
    "rumorImpact" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "warningsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsImpactSnapshot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NewsImpactSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "NewsItem" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "collectedAt" DATETIME;
ALTER TABLE "NewsItem" ADD COLUMN "sourceTier" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "NewsItem" ADD COLUMN "isConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NewsItem" ADD COLUMN "impactDirection" TEXT NOT NULL DEFAULT 'neutral';
ALTER TABLE "NewsItem" ADD COLUMN "riskScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "NewsItem" ADD COLUMN "confidence" REAL NOT NULL DEFAULT 0.5;
ALTER TABLE "NewsItem" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "NewsItem" ADD COLUMN "sourceMode" TEXT NOT NULL DEFAULT 'manual_real';
ALTER TABLE "NewsItem" ADD COLUMN "rawJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "NewsItem" ADD COLUMN "updatedAt" DATETIME;

UPDATE "NewsItem"
SET
  "collectedAt" = COALESCE("collectedAt", "createdAt"),
  "updatedAt" = COALESCE("updatedAt", "createdAt"),
  "sourceTier" = CASE
    WHEN "isOfficial" = true OR lower("reliability") LIKE '%official%' THEN 'official'
    WHEN "isRumor" = true OR lower("reliability") LIKE '%rumor%' THEN 'rumor'
    WHEN lower("reliability") LIKE '%insider%' THEN 'insider'
    WHEN lower("reliability") LIKE '%confirmed%' OR lower("reliability") LIKE '%reliable%' THEN 'media_reference'
    ELSE 'unknown'
  END,
  "isConfirmed" = CASE
    WHEN "isOfficial" = true OR lower("reliability") LIKE '%confirmed%' OR lower("reliability") LIKE '%official%' THEN true
    ELSE false
  END,
  "impactDirection" = CASE
    WHEN "impactScore" > 0 THEN 'positive'
    WHEN "impactScore" < 0 THEN 'negative'
    ELSE 'neutral'
  END,
  "riskScore" = CASE
    WHEN "isRumor" = true THEN abs("impactScore") * 1.5
    ELSE abs("impactScore") * 0.5
  END,
  "confidence" = CASE
    WHEN "isOfficial" = true THEN 0.9
    WHEN "isRumor" = true THEN 0.35
    ELSE min(0.8, max(0.35, abs("maxAllowedImpact") / 12.0))
  END,
  "sourceMode" = CASE
    WHEN "source" = 'analyst_sample' THEN 'analyst_sample'
    WHEN "source" = 'manual_enrichment' THEN 'manual_real'
    ELSE 'manual_real'
  END;

CREATE INDEX "NewsSource_sourceType_sourceTier_idx" ON "NewsSource"("sourceType", "sourceTier");
CREATE INDEX "NewsSource_name_idx" ON "NewsSource"("name");
CREATE INDEX "NewsImpactSnapshot_matchId_createdAt_idx" ON "NewsImpactSnapshot"("matchId", "createdAt");
CREATE INDEX "NewsImpactSnapshot_teamId_idx" ON "NewsImpactSnapshot"("teamId");
CREATE INDEX "NewsItem_sourceId_idx" ON "NewsItem"("sourceId");
CREATE INDEX "NewsItem_sourceMode_sourceTier_idx" ON "NewsItem"("sourceMode", "sourceTier");
CREATE INDEX "NewsItem_expiresAt_idx" ON "NewsItem"("expiresAt");
