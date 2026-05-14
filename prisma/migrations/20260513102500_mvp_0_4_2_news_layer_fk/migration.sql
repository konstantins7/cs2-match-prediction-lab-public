-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT,
    "teamId" TEXT,
    "playerId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "collectedAt" DATETIME,
    "reliability" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceTier" TEXT NOT NULL DEFAULT 'unknown',
    "sentiment" TEXT NOT NULL,
    "impactDirection" TEXT NOT NULL DEFAULT 'neutral',
    "impactScore" REAL NOT NULL,
    "maxAllowedImpact" REAL NOT NULL,
    "riskScore" REAL NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "isRumor" BOOLEAN NOT NULL DEFAULT false,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME,
    "sourceMode" TEXT NOT NULL DEFAULT 'manual_real',
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "matchId" TEXT,
    "importBatchId" TEXT,
    "sourceRecordId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "NewsItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NewsItem" ("collectedAt", "confidence", "createdAt", "eventType", "expiresAt", "id", "impactDirection", "impactScore", "importBatchId", "isActive", "isConfirmed", "isOfficial", "isRumor", "matchId", "maxAllowedImpact", "playerId", "publishedAt", "rawJson", "reliability", "riskScore", "sentiment", "source", "sourceId", "sourceMode", "sourceRecordId", "sourceTier", "summary", "teamId", "title", "updatedAt", "url") SELECT "collectedAt", "confidence", "createdAt", "eventType", "expiresAt", "id", "impactDirection", "impactScore", "importBatchId", "isActive", "isConfirmed", "isOfficial", "isRumor", "matchId", "maxAllowedImpact", "playerId", "publishedAt", "rawJson", "reliability", "riskScore", "sentiment", "source", "sourceId", "sourceMode", "sourceRecordId", "sourceTier", "summary", "teamId", "title", "updatedAt", "url" FROM "NewsItem";
DROP TABLE "NewsItem";
ALTER TABLE "new_NewsItem" RENAME TO "NewsItem";
CREATE INDEX "NewsItem_sourceId_idx" ON "NewsItem"("sourceId");
CREATE INDEX "NewsItem_teamId_idx" ON "NewsItem"("teamId");
CREATE INDEX "NewsItem_playerId_idx" ON "NewsItem"("playerId");
CREATE INDEX "NewsItem_matchId_source_idx" ON "NewsItem"("matchId", "source");
CREATE INDEX "NewsItem_importBatchId_idx" ON "NewsItem"("importBatchId");
CREATE INDEX "NewsItem_sourceMode_sourceTier_idx" ON "NewsItem"("sourceMode", "sourceTier");
CREATE INDEX "NewsItem_expiresAt_idx" ON "NewsItem"("expiresAt");
CREATE TABLE "new_NewsSource" (
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NewsSource" ("apiAllowed", "createdAt", "handle", "id", "isInsider", "isManualOnly", "isOfficial", "name", "notes", "platform", "reliabilityBase", "scrapingAllowed", "sourceTier", "sourceType", "updatedAt", "url") SELECT "apiAllowed", "createdAt", "handle", "id", "isInsider", "isManualOnly", "isOfficial", "name", "notes", "platform", "reliabilityBase", "scrapingAllowed", "sourceTier", "sourceType", "updatedAt", "url" FROM "NewsSource";
DROP TABLE "NewsSource";
ALTER TABLE "new_NewsSource" RENAME TO "NewsSource";
CREATE INDEX "NewsSource_sourceType_sourceTier_idx" ON "NewsSource"("sourceType", "sourceTier");
CREATE INDEX "NewsSource_name_idx" ON "NewsSource"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
