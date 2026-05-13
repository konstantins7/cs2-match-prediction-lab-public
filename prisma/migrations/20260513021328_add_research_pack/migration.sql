-- CreateTable
CREATE TABLE "ResearchPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "readinessLevel" TEXT NOT NULL,
    "checklistJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResearchPack_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchPack_matchId_key" ON "ResearchPack"("matchId");

-- CreateIndex
CREATE INDEX "ResearchPack_readinessLevel_idx" ON "ResearchPack"("readinessLevel");
