CREATE TABLE "MatchFeatureHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "avgTeamARating" REAL NOT NULL,
    "avgTeamBRating" REAL NOT NULL,
    "mapPoolOverlap" REAL NOT NULL,
    "rosterStability" REAL NOT NULL,
    "recentWinRateA" REAL NOT NULL,
    "recentWinRateB" REAL NOT NULL,
    "tournamentTier" INTEGER NOT NULL,
    "isLan" BOOLEAN NOT NULL,
    "mapPoolJson" TEXT NOT NULL DEFAULT '[]',
    "rosterAJson" TEXT NOT NULL DEFAULT '[]',
    "rosterBJson" TEXT NOT NULL DEFAULT '[]',
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchFeatureHistory_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MatchFeatureHistory_matchId_key" ON "MatchFeatureHistory"("matchId");
CREATE INDEX "MatchFeatureHistory_matchId_idx" ON "MatchFeatureHistory"("matchId");
CREATE INDEX "MatchFeatureHistory_teamAId_teamBId_idx" ON "MatchFeatureHistory"("teamAId", "teamBId");
CREATE INDEX "MatchFeatureHistory_computedAt_idx" ON "MatchFeatureHistory"("computedAt");
