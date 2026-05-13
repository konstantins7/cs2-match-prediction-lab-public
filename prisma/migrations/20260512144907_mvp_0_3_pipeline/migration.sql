-- CreateTable
CREATE TABLE "ExternalSourceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "rawJson" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "hash" TEXT NOT NULL,
    "sourceConfidence" REAL NOT NULL DEFAULT 0.5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DataSyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "recordsFetched" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT NOT NULL,
    "notes" TEXT,
    "lastSyncedAt" DATETIME,
    "cursor" TEXT,
    "since" DATETIME,
    "nextAllowedSyncAt" DATETIME,
    "rateLimitRemaining" INTEGER,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SourceHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSuccessAt" DATETIME,
    "lastFailureAt" DATETIME,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimitRemaining" INTEGER,
    "notes" TEXT,
    "lastSyncedAt" DATETIME,
    "cursor" TEXT,
    "since" DATETIME,
    "nextAllowedSyncAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OpponentMatchupProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "opponentTeamId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rosterSimilarity" REAL NOT NULL,
    "matchesPlayed" INTEGER NOT NULL,
    "mapsPlayed" INTEGER NOT NULL,
    "matchWinRate" REAL NOT NULL,
    "mapWinRate" REAL NOT NULL,
    "averageRoundDiff" REAL NOT NULL,
    "favoriteMapsJson" TEXT NOT NULL,
    "weakMapsJson" TEXT NOT NULL,
    "styleAdvantageScore" REAL NOT NULL,
    "awpMatchupScore" REAL NOT NULL,
    "entryMatchupScore" REAL NOT NULL,
    "vetoPunishScore" REAL NOT NULL,
    "overtimeMatchupScore" REAL NOT NULL,
    "closingMatchupScore" REAL NOT NULL,
    "confidenceScore" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TeamStyleSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "aggressionScore" REAL NOT NULL,
    "defaultHeavyScore" REAL NOT NULL,
    "executeHeavyScore" REAL NOT NULL,
    "awpDependencyScore" REAL NOT NULL,
    "entryDependencyScore" REAL NOT NULL,
    "pistolDependencyScore" REAL NOT NULL,
    "forceBuyStrength" REAL NOT NULL,
    "ctSideStrength" REAL NOT NULL,
    "tSideStrength" REAL NOT NULL,
    "retakeStrength" REAL NOT NULL,
    "clutchStrength" REAL NOT NULL,
    "tempoScore" REAL NOT NULL,
    "volatilityScore" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PredictionDataWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "windowType" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "rosterVersionId" TEXT,
    "gameMetaVersionId" TEXT,
    "mapPoolVersionId" TEXT,
    "matchesCount" INTEGER NOT NULL,
    "mapsCount" INTEGER NOT NULL,
    "dataQualityScore" REAL NOT NULL,
    "relevanceScore" REAL NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EntityAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EntityMatchCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalName" TEXT NOT NULL,
    "matchedEntityId" TEXT,
    "confidence" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ExternalSourceRecord_entityType_entityId_idx" ON "ExternalSourceRecord"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ExternalSourceRecord_source_fetchedAt_idx" ON "ExternalSourceRecord"("source", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSourceRecord_source_entityType_externalId_key" ON "ExternalSourceRecord"("source", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "DataSyncJob_source_jobType_startedAt_idx" ON "DataSyncJob"("source", "jobType", "startedAt");

-- CreateIndex
CREATE INDEX "DataSyncJob_status_idx" ON "DataSyncJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SourceHealth_source_key" ON "SourceHealth"("source");

-- CreateIndex
CREATE INDEX "OpponentMatchupProfile_teamId_opponentTeamId_idx" ON "OpponentMatchupProfile"("teamId", "opponentTeamId");

-- CreateIndex
CREATE INDEX "OpponentMatchupProfile_period_idx" ON "OpponentMatchupProfile"("period");

-- CreateIndex
CREATE INDEX "TeamStyleSnapshot_teamId_period_idx" ON "TeamStyleSnapshot"("teamId", "period");

-- CreateIndex
CREATE INDEX "PredictionDataWindow_matchId_teamId_idx" ON "PredictionDataWindow"("matchId", "teamId");

-- CreateIndex
CREATE INDEX "PredictionDataWindow_windowType_idx" ON "PredictionDataWindow"("windowType");

-- CreateIndex
CREATE INDEX "EntityAlias_entityType_entityId_idx" ON "EntityAlias"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityAlias_alias_idx" ON "EntityAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAlias_entityType_source_externalId_key" ON "EntityAlias"("entityType", "source", "externalId");

-- CreateIndex
CREATE INDEX "EntityMatchCandidate_source_entityType_externalId_idx" ON "EntityMatchCandidate"("source", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "EntityMatchCandidate_status_idx" ON "EntityMatchCandidate"("status");
