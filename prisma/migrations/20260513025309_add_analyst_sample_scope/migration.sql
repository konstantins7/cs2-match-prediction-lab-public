-- AlterTable
ALTER TABLE "Player" ADD COLUMN "importBatchId" TEXT;
ALTER TABLE "Player" ADD COLUMN "matchId" TEXT;
ALTER TABLE "Player" ADD COLUMN "sourceRecordId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HeadToHead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "format" TEXT NOT NULL,
    "winnerTeamId" TEXT,
    "teamARosterSimilarity" REAL NOT NULL,
    "teamBRosterSimilarity" REAL NOT NULL,
    "relevanceScore" REAL NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "importBatchId" TEXT,
    "sourceRecordId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "HeadToHead_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HeadToHead" ("date", "format", "id", "matchId", "notes", "relevanceScore", "teamAId", "teamARosterSimilarity", "teamBId", "teamBRosterSimilarity", "winnerTeamId") SELECT "date", "format", "id", "matchId", "notes", "relevanceScore", "teamAId", "teamARosterSimilarity", "teamBId", "teamBRosterSimilarity", "winnerTeamId" FROM "HeadToHead";
DROP TABLE "HeadToHead";
ALTER TABLE "new_HeadToHead" RENAME TO "HeadToHead";
CREATE INDEX "HeadToHead_teamAId_teamBId_idx" ON "HeadToHead"("teamAId", "teamBId");
CREATE INDEX "HeadToHead_matchId_source_idx" ON "HeadToHead"("matchId", "source");
CREATE INDEX "HeadToHead_importBatchId_idx" ON "HeadToHead"("importBatchId");
CREATE TABLE "new_NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT,
    "playerId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "reliability" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "impactScore" REAL NOT NULL,
    "maxAllowedImpact" REAL NOT NULL,
    "isRumor" BOOLEAN NOT NULL DEFAULT false,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "matchId" TEXT,
    "importBatchId" TEXT,
    "sourceRecordId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NewsItem" ("createdAt", "eventType", "id", "impactScore", "isOfficial", "isRumor", "maxAllowedImpact", "playerId", "publishedAt", "reliability", "sentiment", "source", "summary", "teamId", "title", "url") SELECT "createdAt", "eventType", "id", "impactScore", "isOfficial", "isRumor", "maxAllowedImpact", "playerId", "publishedAt", "reliability", "sentiment", "source", "summary", "teamId", "title", "url" FROM "NewsItem";
DROP TABLE "NewsItem";
ALTER TABLE "new_NewsItem" RENAME TO "NewsItem";
CREATE INDEX "NewsItem_teamId_idx" ON "NewsItem"("teamId");
CREATE INDEX "NewsItem_playerId_idx" ON "NewsItem"("playerId");
CREATE INDEX "NewsItem_matchId_source_idx" ON "NewsItem"("matchId", "source");
CREATE INDEX "NewsItem_importBatchId_idx" ON "NewsItem"("importBatchId");
CREATE TABLE "new_PlayerStatSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "maps" INTEGER NOT NULL,
    "rounds" INTEGER NOT NULL,
    "kd" REAL NOT NULL,
    "kdDiff" INTEGER NOT NULL,
    "rating" REAL NOT NULL,
    "adr" REAL NOT NULL,
    "kast" REAL NOT NULL,
    "impact" REAL NOT NULL,
    "openingKillRating" REAL NOT NULL,
    "clutchScore" REAL NOT NULL,
    "volatilityScore" REAL NOT NULL,
    "pressureScore" REAL NOT NULL,
    "trendScore" REAL NOT NULL,
    "ratingTrend" REAL NOT NULL,
    "kdTrend" REAL NOT NULL,
    "adrTrend" REAL NOT NULL,
    "openingDuelTrend" REAL NOT NULL,
    "clutchTrend" REAL NOT NULL,
    "pressurePerformance" REAL NOT NULL,
    "mapSpecificPerformance" REAL NOT NULL,
    "roleImpact" REAL NOT NULL,
    "starDependency" REAL NOT NULL,
    "worstPlayerLiability" REAL NOT NULL,
    "lanRating" REAL NOT NULL,
    "onlineRating" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "matchId" TEXT,
    "importBatchId" TEXT,
    "sourceRecordId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerStatSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlayerStatSnapshot" ("adr", "adrTrend", "clutchScore", "clutchTrend", "createdAt", "id", "impact", "kast", "kd", "kdDiff", "kdTrend", "lanRating", "mapSpecificPerformance", "maps", "onlineRating", "openingDuelTrend", "openingKillRating", "period", "playerId", "pressurePerformance", "pressureScore", "rating", "ratingTrend", "roleImpact", "rounds", "source", "sourceUrl", "starDependency", "teamId", "trendScore", "volatilityScore", "worstPlayerLiability") SELECT "adr", "adrTrend", "clutchScore", "clutchTrend", "createdAt", "id", "impact", "kast", "kd", "kdDiff", "kdTrend", "lanRating", "mapSpecificPerformance", "maps", "onlineRating", "openingDuelTrend", "openingKillRating", "period", "playerId", "pressurePerformance", "pressureScore", "rating", "ratingTrend", "roleImpact", "rounds", "source", "sourceUrl", "starDependency", "teamId", "trendScore", "volatilityScore", "worstPlayerLiability" FROM "PlayerStatSnapshot";
DROP TABLE "PlayerStatSnapshot";
ALTER TABLE "new_PlayerStatSnapshot" RENAME TO "PlayerStatSnapshot";
CREATE INDEX "PlayerStatSnapshot_playerId_idx" ON "PlayerStatSnapshot"("playerId");
CREATE INDEX "PlayerStatSnapshot_teamId_idx" ON "PlayerStatSnapshot"("teamId");
CREATE INDEX "PlayerStatSnapshot_matchId_source_idx" ON "PlayerStatSnapshot"("matchId", "source");
CREATE INDEX "PlayerStatSnapshot_importBatchId_idx" ON "PlayerStatSnapshot"("importBatchId");
CREATE TABLE "new_TeamMapStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "mapName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "mapsPlayed" INTEGER NOT NULL,
    "winRate" REAL NOT NULL,
    "pickRate" REAL NOT NULL,
    "banRate" REAL NOT NULL,
    "firstPickRate" REAL NOT NULL,
    "deciderRate" REAL NOT NULL,
    "ctRoundWinRate" REAL NOT NULL,
    "tRoundWinRate" REAL NOT NULL,
    "pistolWinRate" REAL NOT NULL,
    "conversionAfterPistolWin" REAL NOT NULL,
    "forceBuyWinRate" REAL NOT NULL,
    "antiEcoLossRate" REAL NOT NULL,
    "overtimeWinRate" REAL NOT NULL,
    "multipleOvertimeWinRate" REAL NOT NULL,
    "overtimeFrequency" REAL NOT NULL,
    "pressureRoundWinRate" REAL NOT NULL,
    "clutchInOvertimeScore" REAL NOT NULL,
    "closingScore" REAL NOT NULL,
    "comebackScore" REAL NOT NULL,
    "ecoRecoveryScore" REAL NOT NULL,
    "resetResistanceScore" REAL NOT NULL,
    "recentTrend" REAL NOT NULL,
    "openingRoundPerformance" REAL NOT NULL,
    "sampleQuality" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "matchId" TEXT,
    "importBatchId" TEXT,
    "sourceRecordId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMapStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TeamMapStat" ("antiEcoLossRate", "banRate", "closingScore", "clutchInOvertimeScore", "comebackScore", "conversionAfterPistolWin", "createdAt", "ctRoundWinRate", "deciderRate", "ecoRecoveryScore", "firstPickRate", "forceBuyWinRate", "id", "mapName", "mapsPlayed", "multipleOvertimeWinRate", "openingRoundPerformance", "overtimeFrequency", "overtimeWinRate", "period", "pickRate", "pistolWinRate", "pressureRoundWinRate", "recentTrend", "resetResistanceScore", "sampleQuality", "source", "sourceUrl", "tRoundWinRate", "teamId", "winRate") SELECT "antiEcoLossRate", "banRate", "closingScore", "clutchInOvertimeScore", "comebackScore", "conversionAfterPistolWin", "createdAt", "ctRoundWinRate", "deciderRate", "ecoRecoveryScore", "firstPickRate", "forceBuyWinRate", "id", "mapName", "mapsPlayed", "multipleOvertimeWinRate", "openingRoundPerformance", "overtimeFrequency", "overtimeWinRate", "period", "pickRate", "pistolWinRate", "pressureRoundWinRate", "recentTrend", "resetResistanceScore", "sampleQuality", "source", "sourceUrl", "tRoundWinRate", "teamId", "winRate" FROM "TeamMapStat";
DROP TABLE "TeamMapStat";
ALTER TABLE "new_TeamMapStat" RENAME TO "TeamMapStat";
CREATE INDEX "TeamMapStat_teamId_mapName_idx" ON "TeamMapStat"("teamId", "mapName");
CREATE INDEX "TeamMapStat_matchId_source_idx" ON "TeamMapStat"("matchId", "source");
CREATE INDEX "TeamMapStat_importBatchId_idx" ON "TeamMapStat"("importBatchId");
CREATE TABLE "new_VetoPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "opponentTeamId" TEXT,
    "format" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "mapName" TEXT NOT NULL,
    "pickProbability" REAL NOT NULL,
    "banProbability" REAL NOT NULL,
    "punishProbability" REAL NOT NULL,
    "weaknessScore" REAL NOT NULL,
    "comfortScore" REAL NOT NULL,
    "confidenceScore" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "matchId" TEXT,
    "importBatchId" TEXT,
    "sourceRecordId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VetoPattern_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VetoPattern_opponentTeamId_fkey" FOREIGN KEY ("opponentTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VetoPattern" ("banProbability", "comfortScore", "confidenceScore", "createdAt", "format", "id", "mapName", "opponentTeamId", "period", "pickProbability", "punishProbability", "teamId", "weaknessScore") SELECT "banProbability", "comfortScore", "confidenceScore", "createdAt", "format", "id", "mapName", "opponentTeamId", "period", "pickProbability", "punishProbability", "teamId", "weaknessScore" FROM "VetoPattern";
DROP TABLE "VetoPattern";
ALTER TABLE "new_VetoPattern" RENAME TO "VetoPattern";
CREATE INDEX "VetoPattern_teamId_mapName_idx" ON "VetoPattern"("teamId", "mapName");
CREATE INDEX "VetoPattern_matchId_source_idx" ON "VetoPattern"("matchId", "source");
CREATE INDEX "VetoPattern_importBatchId_idx" ON "VetoPattern"("importBatchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
