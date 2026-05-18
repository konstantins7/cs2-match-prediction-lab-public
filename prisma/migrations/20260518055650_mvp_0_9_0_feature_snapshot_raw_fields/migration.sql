-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MatchFeatureSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "featureSchemaVersion" TEXT NOT NULL,
    "readinessLevel" TEXT NOT NULL,
    "sourceMode" TEXT NOT NULL,
    "dataQualityScore" REAL NOT NULL,
    "featureCutoffTime" DATETIME NOT NULL,
    "dataLeakageCheckPassed" BOOLEAN NOT NULL DEFAULT true,
    "featureSourcesJson" TEXT NOT NULL,
    "missingCriticalDataJson" TEXT NOT NULL,
    "sourceConfidence" REAL NOT NULL,
    "sampleSizeScore" REAL NOT NULL,
    "valveRankDiff" REAL NOT NULL,
    "hltvManualRankDiff" REAL NOT NULL,
    "internalEloDiff" REAL NOT NULL,
    "ratingUncertaintyDiff" REAL NOT NULL,
    "recentWinRateDiff" REAL NOT NULL,
    "opponentAdjustedFormDiff" REAL NOT NULL,
    "currentRosterFormDiff" REAL NOT NULL,
    "teamAAvgPlayerRating" REAL NOT NULL DEFAULT 0,
    "teamBAvgPlayerRating" REAL NOT NULL DEFAULT 0,
    "teamATotalMapsPlayed" INTEGER NOT NULL DEFAULT 0,
    "teamBTotalMapsPlayed" INTEGER NOT NULL DEFAULT 0,
    "avgPlayerRatingDiff" REAL NOT NULL,
    "kdDiff" REAL NOT NULL,
    "adrDiff" REAL NOT NULL,
    "kastDiff" REAL NOT NULL,
    "impactDiff" REAL NOT NULL,
    "starPlayerDiff" REAL NOT NULL,
    "awpImpactDiff" REAL NOT NULL,
    "worstPlayerLiabilityDiff" REAL NOT NULL,
    "mapPoolAdvantage" REAL NOT NULL,
    "vetoAdvantage" REAL NOT NULL,
    "deciderAdvantage" REAL NOT NULL,
    "mapSampleConfidence" REAL NOT NULL,
    "punishRisk" REAL NOT NULL,
    "pistolAdvantage" REAL NOT NULL,
    "forceBuyAdvantage" REAL NOT NULL,
    "economyRecoveryAdvantage" REAL NOT NULL,
    "closingAdvantage" REAL NOT NULL,
    "overtimeAdvantage" REAL NOT NULL,
    "rosterStabilityDiff" REAL NOT NULL,
    "newsImpactDiff" REAL NOT NULL,
    "fatigueDiff" REAL NOT NULL,
    "lanOnlineDiff" REAL NOT NULL,
    "patchRelevance" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchFeatureSnapshot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MatchFeatureSnapshot" ("adrDiff", "avgPlayerRatingDiff", "awpImpactDiff", "closingAdvantage", "createdAt", "currentRosterFormDiff", "dataLeakageCheckPassed", "dataQualityScore", "deciderAdvantage", "economyRecoveryAdvantage", "fatigueDiff", "featureCutoffTime", "featureSchemaVersion", "featureSourcesJson", "forceBuyAdvantage", "hltvManualRankDiff", "id", "impactDiff", "internalEloDiff", "kastDiff", "kdDiff", "lanOnlineDiff", "mapPoolAdvantage", "mapSampleConfidence", "matchId", "missingCriticalDataJson", "modelVersion", "newsImpactDiff", "opponentAdjustedFormDiff", "overtimeAdvantage", "patchRelevance", "pistolAdvantage", "punishRisk", "ratingUncertaintyDiff", "readinessLevel", "recentWinRateDiff", "rosterStabilityDiff", "sampleSizeScore", "sourceConfidence", "sourceMode", "starPlayerDiff", "valveRankDiff", "vetoAdvantage", "worstPlayerLiabilityDiff") SELECT "adrDiff", "avgPlayerRatingDiff", "awpImpactDiff", "closingAdvantage", "createdAt", "currentRosterFormDiff", "dataLeakageCheckPassed", "dataQualityScore", "deciderAdvantage", "economyRecoveryAdvantage", "fatigueDiff", "featureCutoffTime", "featureSchemaVersion", "featureSourcesJson", "forceBuyAdvantage", "hltvManualRankDiff", "id", "impactDiff", "internalEloDiff", "kastDiff", "kdDiff", "lanOnlineDiff", "mapPoolAdvantage", "mapSampleConfidence", "matchId", "missingCriticalDataJson", "modelVersion", "newsImpactDiff", "opponentAdjustedFormDiff", "overtimeAdvantage", "patchRelevance", "pistolAdvantage", "punishRisk", "ratingUncertaintyDiff", "readinessLevel", "recentWinRateDiff", "rosterStabilityDiff", "sampleSizeScore", "sourceConfidence", "sourceMode", "starPlayerDiff", "valveRankDiff", "vetoAdvantage", "worstPlayerLiabilityDiff" FROM "MatchFeatureSnapshot";
DROP TABLE "MatchFeatureSnapshot";
ALTER TABLE "new_MatchFeatureSnapshot" RENAME TO "MatchFeatureSnapshot";
CREATE INDEX "MatchFeatureSnapshot_matchId_createdAt_idx" ON "MatchFeatureSnapshot"("matchId", "createdAt");
CREATE INDEX "MatchFeatureSnapshot_readinessLevel_idx" ON "MatchFeatureSnapshot"("readinessLevel");
CREATE INDEX "MatchFeatureSnapshot_modelVersion_featureSchemaVersion_idx" ON "MatchFeatureSnapshot"("modelVersion", "featureSchemaVersion");
CREATE INDEX "MatchFeatureSnapshot_dataLeakageCheckPassed_idx" ON "MatchFeatureSnapshot"("dataLeakageCheckPassed");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
