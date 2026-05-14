-- CreateTable
CREATE TABLE "Team" (
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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Player" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "mapName" TEXT NOT NULL,
    "mapOrder" INTEGER NOT NULL,
    "pickedByTeamId" TEXT,
    "bannedByTeamId" TEXT,
    "teamAScore" INTEGER,
    "teamBScore" INTEGER,
    "winnerTeamId" TEXT,
    "wentOvertime" BOOLEAN NOT NULL DEFAULT false,
    "overtimeCount" INTEGER NOT NULL DEFAULT 0,
    "regulationScore" TEXT,
    "teamACTRoundsWon" INTEGER,
    "teamATRoundsWon" INTEGER,
    "teamBCTRoundsWon" INTEGER,
    "teamBTRoundsWon" INTEGER,
    CONSTRAINT "MatchMap_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerStatSnapshot" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerStatSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamFormSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "matchesPlayed" INTEGER NOT NULL,
    "mapsPlayed" INTEGER NOT NULL,
    "matchWinRate" REAL NOT NULL,
    "mapWinRate" REAL NOT NULL,
    "roundWinRate" REAL NOT NULL,
    "vsTop10WinRate" REAL NOT NULL,
    "vsTop20WinRate" REAL NOT NULL,
    "vsTop50WinRate" REAL NOT NULL,
    "vsTop100WinRate" REAL NOT NULL,
    "winVsTop10" REAL NOT NULL,
    "winVsTop20" REAL NOT NULL,
    "winVsTop50" REAL NOT NULL,
    "winVsTop100" REAL NOT NULL,
    "lossVsLowerRanked" REAL NOT NULL,
    "opponentStrengthAdjustedForm" REAL NOT NULL,
    "currentStreak" INTEGER NOT NULL,
    "formScore" REAL NOT NULL,
    "volatilityScore" REAL NOT NULL,
    "matchesLast7Days" INTEGER NOT NULL,
    "mapsLast7Days" INTEGER NOT NULL,
    "travelRiskScore" REAL NOT NULL,
    "timezoneShiftHours" REAL NOT NULL,
    "fatigueScore" REAL NOT NULL,
    "lanWinRate" REAL NOT NULL,
    "onlineWinRate" REAL NOT NULL,
    "motivationScore" REAL NOT NULL,
    "rosterStabilityScore" REAL NOT NULL,
    "closeOutRate" REAL NOT NULL,
    "mapPointConversion" REAL NOT NULL,
    "leadProtectionScore" REAL NOT NULL,
    "lostFromWinningPositionRate" REAL NOT NULL,
    "deciderCollapseRate" REAL NOT NULL,
    "seriesCloseOutRate" REAL NOT NULL,
    "comebackFrom3RoundDeficit" REAL NOT NULL,
    "comebackFrom5RoundDeficit" REAL NOT NULL,
    "badHalfRecovery" REAL NOT NULL,
    "lostPistolRecovery" REAL NOT NULL,
    "lostOwnPickRecovery" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamFormSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMapStat" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMapStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VetoPattern" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VetoPattern_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VetoPattern_opponentTeamId_fkey" FOREIGN KEY ("opponentTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HeadToHead" (
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
    CONSTRAINT "HeadToHead_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsItem" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "teamAProbability" REAL NOT NULL,
    "teamBProbability" REAL NOT NULL,
    "predictedWinnerId" TEXT,
    "confidenceScore" REAL NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "dataQualityScore" REAL NOT NULL,
    "explanation" TEXT NOT NULL,
    "warningsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PredictionFactor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "predictionId" TEXT NOT NULL,
    "factorName" TEXT NOT NULL,
    "factorGroup" TEXT NOT NULL,
    "teamAValue" REAL NOT NULL,
    "teamBValue" REAL NOT NULL,
    "rawDifference" REAL NOT NULL,
    "normalizedDifference" REAL NOT NULL,
    "weight" REAL NOT NULL,
    "impact" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "PredictionFactor_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelWeightPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weightsJson" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SourceSyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT NOT NULL,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "GameMetaVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patchDate" DATETIME NOT NULL,
    "patchName" TEXT NOT NULL,
    "patchType" TEXT NOT NULL,
    "affectedAreas" TEXT NOT NULL,
    "impactScore" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TeamRosterVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "playerIdsJson" TEXT NOT NULL,
    "coachId" TEXT,
    "iglPlayerId" TEXT,
    "mainLanguage" TEXT NOT NULL,
    "coreStabilityScore" REAL NOT NULL,
    "mapsPlayedTogether" INTEGER NOT NULL,
    "matchesPlayedTogether" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamRosterVersion_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerTeamHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL,
    "leftAt" DATETIME,
    "role" TEXT NOT NULL,
    "mainPositionsJson" TEXT NOT NULL,
    "mapsPlayed" INTEGER NOT NULL,
    "rating" REAL NOT NULL,
    "kd" REAL NOT NULL,
    "notes" TEXT,
    CONSTRAINT "PlayerTeamHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerRoleSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "role" TEXT NOT NULL,
    "mapName" TEXT NOT NULL,
    "positionsJson" TEXT NOT NULL,
    "openingDuelRate" REAL NOT NULL,
    "clutchRate" REAL NOT NULL,
    "adr" REAL NOT NULL,
    "rating" REAL NOT NULL,
    "kd" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    CONSTRAINT "PlayerRoleSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamChemistrySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "rosterVersionId" TEXT NOT NULL,
    "sharedExperienceScore" REAL NOT NULL,
    "languageCompatibilityScore" REAL NOT NULL,
    "roleFitScore" REAL NOT NULL,
    "coreStabilityScore" REAL NOT NULL,
    "adaptationScore" REAL NOT NULL,
    "volatilityScore" REAL NOT NULL,
    "notes" TEXT,
    CONSTRAINT "TeamChemistrySnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamChemistrySnapshot_rosterVersionId_fkey" FOREIGN KEY ("rosterVersionId") REFERENCES "TeamRosterVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RosterEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL,
    "oldTeamId" TEXT,
    "newTeamId" TEXT,
    "oldRole" TEXT,
    "newRole" TEXT,
    "oldPositionsJson" TEXT,
    "newPositionsJson" TEXT,
    "expectedImpact" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RosterEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapName" TEXT NOT NULL,
    "versionName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "changeType" TEXT NOT NULL,
    "impactScore" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ActiveMapPoolVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "mapsJson" TEXT NOT NULL,
    "notes" TEXT,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PredictionAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "predictionId" TEXT,
    "matchId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "inputSnapshotJson" TEXT NOT NULL,
    "factorOutputJson" TEXT NOT NULL,
    "finalProbabilityJson" TEXT NOT NULL,
    "warningsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PredictionAudit_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PredictionAudit_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "Match_status_startTime_idx" ON "Match"("status", "startTime");

-- CreateIndex
CREATE INDEX "Match_teamAId_idx" ON "Match"("teamAId");

-- CreateIndex
CREATE INDEX "Match_teamBId_idx" ON "Match"("teamBId");

-- CreateIndex
CREATE INDEX "MatchMap_matchId_idx" ON "MatchMap"("matchId");

-- CreateIndex
CREATE INDEX "PlayerStatSnapshot_playerId_idx" ON "PlayerStatSnapshot"("playerId");

-- CreateIndex
CREATE INDEX "PlayerStatSnapshot_teamId_idx" ON "PlayerStatSnapshot"("teamId");

-- CreateIndex
CREATE INDEX "TeamFormSnapshot_teamId_idx" ON "TeamFormSnapshot"("teamId");

-- CreateIndex
CREATE INDEX "TeamMapStat_teamId_mapName_idx" ON "TeamMapStat"("teamId", "mapName");

-- CreateIndex
CREATE INDEX "VetoPattern_teamId_mapName_idx" ON "VetoPattern"("teamId", "mapName");

-- CreateIndex
CREATE INDEX "HeadToHead_teamAId_teamBId_idx" ON "HeadToHead"("teamAId", "teamBId");

-- CreateIndex
CREATE INDEX "NewsItem_teamId_idx" ON "NewsItem"("teamId");

-- CreateIndex
CREATE INDEX "NewsItem_playerId_idx" ON "NewsItem"("playerId");

-- CreateIndex
CREATE INDEX "Prediction_matchId_idx" ON "Prediction"("matchId");

-- CreateIndex
CREATE INDEX "PredictionFactor_predictionId_idx" ON "PredictionFactor"("predictionId");

-- CreateIndex
CREATE INDEX "TeamRosterVersion_teamId_idx" ON "TeamRosterVersion"("teamId");

-- CreateIndex
CREATE INDEX "PlayerTeamHistory_playerId_idx" ON "PlayerTeamHistory"("playerId");

-- CreateIndex
CREATE INDEX "PlayerTeamHistory_teamId_idx" ON "PlayerTeamHistory"("teamId");

-- CreateIndex
CREATE INDEX "PlayerRoleSnapshot_playerId_mapName_idx" ON "PlayerRoleSnapshot"("playerId", "mapName");

-- CreateIndex
CREATE INDEX "TeamChemistrySnapshot_teamId_idx" ON "TeamChemistrySnapshot"("teamId");

-- CreateIndex
CREATE INDEX "RosterEvent_teamId_idx" ON "RosterEvent"("teamId");

-- CreateIndex
CREATE INDEX "RosterEvent_playerId_idx" ON "RosterEvent"("playerId");

-- CreateIndex
CREATE INDEX "MapVersion_mapName_idx" ON "MapVersion"("mapName");

-- CreateIndex
CREATE INDEX "PredictionAudit_matchId_idx" ON "PredictionAudit"("matchId");
