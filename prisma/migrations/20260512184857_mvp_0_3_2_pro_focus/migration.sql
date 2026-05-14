-- CreateTable
CREATE TABLE "TeamRankSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" REAL,
    "region" TEXT,
    "rankingDate" DATETIME NOT NULL,
    "rankCategory" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamRankSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TournamentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizer" TEXT,
    "tier" TEXT NOT NULL,
    "importanceScore" INTEGER NOT NULL,
    "isKnownTournament" BOOLEAN NOT NULL DEFAULT false,
    "isQualifier" BOOLEAN NOT NULL DEFAULT false,
    "isAcademy" BOOLEAN NOT NULL DEFAULT false,
    "isRegional" BOOLEAN NOT NULL DEFAULT false,
    "isSeparateCircuit" BOOLEAN NOT NULL DEFAULT false,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isLan" BOOLEAN NOT NULL DEFAULT false,
    "confidence" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "manualPriority" INTEGER,
    "manualVisibility" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("createdAt", "dataQualityScore", "eventName", "eventTier", "format", "id", "isLan", "isOfficial", "matchUrl", "needsReview", "source", "sourceConfidence", "sourceMatchId", "sourceMode", "stage", "startTime", "status", "teamAId", "teamBId", "updatedAt", "winnerTeamId") SELECT "createdAt", "dataQualityScore", "eventName", "eventTier", "format", "id", "isLan", "isOfficial", "matchUrl", "needsReview", "source", "sourceConfidence", "sourceMatchId", "sourceMode", "stage", "startTime", "status", "teamAId", "teamBId", "updatedAt", "winnerTeamId" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_status_startTime_idx" ON "Match"("status", "startTime");
CREATE INDEX "Match_teamAId_idx" ON "Match"("teamAId");
CREATE INDEX "Match_teamBId_idx" ON "Match"("teamBId");
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
    "isAcademyTeam" BOOLEAN NOT NULL DEFAULT false,
    "parentOrgName" TEXT,
    "teamPriority" INTEGER NOT NULL DEFAULT 0,
    "visibilityTier" TEXT NOT NULL DEFAULT 'notable',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Team" ("country", "createdAt", "gridId", "hltvRank", "hltvReferenceUrl", "id", "internalElo", "isActive", "liquipediaReferenceUrl", "name", "needsReview", "pandaScoreId", "region", "slug", "sourceConfidence", "sourceMode", "topRankCategory", "updatedAt", "valveRank") SELECT "country", "createdAt", "gridId", "hltvRank", "hltvReferenceUrl", "id", "internalElo", "isActive", "liquipediaReferenceUrl", "name", "needsReview", "pandaScoreId", "region", "slug", "sourceConfidence", "sourceMode", "topRankCategory", "updatedAt", "valveRank" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TeamRankSnapshot_teamId_source_rankingDate_idx" ON "TeamRankSnapshot"("teamId", "source", "rankingDate");

-- CreateIndex
CREATE INDEX "TeamRankSnapshot_source_rank_idx" ON "TeamRankSnapshot"("source", "rank");

-- CreateIndex
CREATE INDEX "TournamentProfile_name_idx" ON "TournamentProfile"("name");

-- CreateIndex
CREATE INDEX "TournamentProfile_tier_idx" ON "TournamentProfile"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentProfile_source_externalId_key" ON "TournamentProfile"("source", "externalId");
