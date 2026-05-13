-- MVP 0.3.3: basic result snapshots for free-source prediction coverage.
CREATE TABLE "TeamBasicResultSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "matchesPlayed" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "winRate" REAL NOT NULL,
    "vsRankedWins" INTEGER NOT NULL,
    "vsRankedLosses" INTEGER NOT NULL,
    "averageOpponentRank" REAL,
    "lastMatchAt" DATETIME,
    "source" TEXT NOT NULL,
    "dataQuality" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamBasicResultSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TeamBasicResultSnapshot_teamId_period_source_key" ON "TeamBasicResultSnapshot"("teamId", "period", "source");
CREATE INDEX "TeamBasicResultSnapshot_teamId_period_idx" ON "TeamBasicResultSnapshot"("teamId", "period");
