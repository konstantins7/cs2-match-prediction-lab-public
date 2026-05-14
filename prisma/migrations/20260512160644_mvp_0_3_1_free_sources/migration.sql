-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DataSyncJob" (
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
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "lastEndpoint" TEXT,
    "lastMethod" TEXT,
    "lastError" TEXT,
    "lastRawSampleJson" TEXT,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "cursor" TEXT,
    "since" DATETIME,
    "nextAllowedSyncAt" DATETIME,
    "rateLimitRemaining" INTEGER,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_DataSyncJob" ("createdAt", "cursor", "errorsJson", "failureCount", "finishedAt", "id", "jobType", "lastSyncedAt", "nextAllowedSyncAt", "notes", "rateLimitRemaining", "recordsCreated", "recordsFetched", "recordsUpdated", "since", "source", "startedAt", "status") SELECT "createdAt", "cursor", "errorsJson", "failureCount", "finishedAt", "id", "jobType", "lastSyncedAt", "nextAllowedSyncAt", "notes", "rateLimitRemaining", "recordsCreated", "recordsFetched", "recordsUpdated", "since", "source", "startedAt", "status" FROM "DataSyncJob";
DROP TABLE "DataSyncJob";
ALTER TABLE "new_DataSyncJob" RENAME TO "DataSyncJob";
CREATE INDEX "DataSyncJob_source_jobType_startedAt_idx" ON "DataSyncJob"("source", "jobType", "startedAt");
CREATE INDEX "DataSyncJob_status_idx" ON "DataSyncJob"("status");
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "sourceMatchId" TEXT,
    "eventName" TEXT NOT NULL,
    "eventTier" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "isLan" BOOLEAN NOT NULL DEFAULT false,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "winnerTeamId" TEXT,
    "matchUrl" TEXT,
    "dataQualityScore" REAL NOT NULL DEFAULT 70,
    "sourceMode" TEXT NOT NULL DEFAULT 'demo',
    "sourceConfidence" REAL NOT NULL DEFAULT 0.5,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("createdAt", "dataQualityScore", "eventName", "eventTier", "format", "id", "isLan", "isOfficial", "matchUrl", "source", "sourceMatchId", "stage", "startTime", "status", "teamAId", "teamBId", "updatedAt", "winnerTeamId") SELECT "createdAt", "dataQualityScore", "eventName", "eventTier", "format", "id", "isLan", "isOfficial", "matchUrl", "source", "sourceMatchId", "stage", "startTime", "status", "teamAId", "teamBId", "updatedAt", "winnerTeamId" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_status_startTime_idx" ON "Match"("status", "startTime");
CREATE INDEX "Match_teamAId_idx" ON "Match"("teamAId");
CREATE INDEX "Match_teamBId_idx" ON "Match"("teamBId");
CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT NOT NULL,
    "realName" TEXT,
    "teamId" TEXT,
    "role" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "age" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" DATETIME,
    "leftAt" DATETIME,
    "hltvReferenceUrl" TEXT,
    "liquipediaReferenceUrl" TEXT,
    "sourceMode" TEXT NOT NULL DEFAULT 'demo',
    "sourceConfidence" REAL NOT NULL DEFAULT 0.5,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Player" ("age", "country", "createdAt", "hltvReferenceUrl", "id", "isActive", "joinedAt", "leftAt", "liquipediaReferenceUrl", "nickname", "realName", "role", "teamId", "updatedAt") SELECT "age", "country", "createdAt", "hltvReferenceUrl", "id", "isActive", "joinedAt", "leftAt", "liquipediaReferenceUrl", "nickname", "realName", "role", "teamId", "updatedAt" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE TABLE "new_SourceHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSuccessAt" DATETIME,
    "lastFailureAt" DATETIME,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimitRemaining" INTEGER,
    "notes" TEXT,
    "lastEndpoint" TEXT,
    "lastMethod" TEXT,
    "lastError" TEXT,
    "lastRawSampleJson" TEXT,
    "lastRecordsFetched" INTEGER NOT NULL DEFAULT 0,
    "lastRecordsCreated" INTEGER NOT NULL DEFAULT 0,
    "lastRecordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "lastRecordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "cursor" TEXT,
    "since" DATETIME,
    "nextAllowedSyncAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SourceHealth" ("createdAt", "cursor", "failureCount", "id", "lastFailureAt", "lastSuccessAt", "lastSyncedAt", "nextAllowedSyncAt", "notes", "rateLimitRemaining", "since", "source", "status", "updatedAt") SELECT "createdAt", "cursor", "failureCount", "id", "lastFailureAt", "lastSuccessAt", "lastSyncedAt", "nextAllowedSyncAt", "notes", "rateLimitRemaining", "since", "source", "status", "updatedAt" FROM "SourceHealth";
DROP TABLE "SourceHealth";
ALTER TABLE "new_SourceHealth" RENAME TO "SourceHealth";
CREATE UNIQUE INDEX "SourceHealth_source_key" ON "SourceHealth"("source");
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "hltvReferenceUrl" TEXT,
    "liquipediaReferenceUrl" TEXT,
    "pandaScoreId" TEXT,
    "gridId" TEXT,
    "valveRank" INTEGER,
    "hltvRank" INTEGER,
    "internalElo" REAL NOT NULL,
    "topRankCategory" TEXT NOT NULL,
    "sourceMode" TEXT NOT NULL DEFAULT 'demo',
    "sourceConfidence" REAL NOT NULL DEFAULT 0.5,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Team" ("country", "createdAt", "gridId", "hltvRank", "hltvReferenceUrl", "id", "internalElo", "isActive", "liquipediaReferenceUrl", "name", "pandaScoreId", "region", "slug", "topRankCategory", "updatedAt", "valveRank") SELECT "country", "createdAt", "gridId", "hltvRank", "hltvReferenceUrl", "id", "internalElo", "isActive", "liquipediaReferenceUrl", "name", "pandaScoreId", "region", "slug", "topRankCategory", "updatedAt", "valveRank" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
