-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "currentStep" TEXT,
    "error" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'local_user',
    "resultState" TEXT,
    "blockersJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisJob_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisJobStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recordsFound" INTEGER NOT NULL DEFAULT 0,
    "blockerCode" TEXT,
    "sourceUsed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisJobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PredictionPick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "analysisJobId" TEXT,
    "pickType" TEXT NOT NULL DEFAULT 'final',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "predictedWinnerTeamId" TEXT,
    "teamAProbability" REAL NOT NULL,
    "teamBProbability" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "risk" TEXT NOT NULL,
    "readiness" TEXT NOT NULL,
    "realForecastReady" BOOLEAN NOT NULL DEFAULT false,
    "dataQuality" REAL NOT NULL,
    "coverageScore" REAL NOT NULL,
    "forecastabilityTier" TEXT NOT NULL,
    "realDataDepth" INTEGER NOT NULL DEFAULT 1,
    "topFactorsJson" TEXT NOT NULL,
    "warningsJson" TEXT NOT NULL,
    "blockersJson" TEXT NOT NULL,
    "sourceSummaryJson" TEXT NOT NULL,
    "missingDataJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchStartTime" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    CONSTRAINT "PredictionPick_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PredictionPick_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PredictionOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "predictionPickId" TEXT NOT NULL,
    "actualWinnerTeamId" TEXT,
    "actualScore" TEXT,
    "resultSource" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resolvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "PredictionOutcome_predictionPickId_fkey" FOREIGN KEY ("predictionPickId") REFERENCES "PredictionPick" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PredictionErrorAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "predictionPickId" TEXT NOT NULL,
    "resultStatus" TEXT NOT NULL,
    "suspectedErrorReasonsJson" TEXT NOT NULL,
    "missingDataAtPredictionJson" TEXT NOT NULL,
    "mainFactorsJson" TEXT NOT NULL,
    "suggestedImprovementsJson" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PredictionErrorAnalysis_predictionPickId_fkey" FOREIGN KEY ("predictionPickId") REFERENCES "PredictionPick" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AnalysisJob_matchId_startedAt_idx" ON "AnalysisJob"("matchId", "startedAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_startedAt_idx" ON "AnalysisJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AnalysisJobStep_jobId_createdAt_idx" ON "AnalysisJobStep"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisJobStep_stepKey_status_idx" ON "AnalysisJobStep"("stepKey", "status");

-- CreateIndex
CREATE INDEX "PredictionPick_status_matchStartTime_idx" ON "PredictionPick"("status", "matchStartTime");

-- CreateIndex
CREATE INDEX "PredictionPick_predictedWinnerTeamId_idx" ON "PredictionPick"("predictedWinnerTeamId");

-- CreateIndex
CREATE INDEX "PredictionPick_analysisJobId_idx" ON "PredictionPick"("analysisJobId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionPick_matchId_pickType_key" ON "PredictionPick"("matchId", "pickType");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionOutcome_predictionPickId_key" ON "PredictionOutcome"("predictionPickId");

-- CreateIndex
CREATE INDEX "PredictionOutcome_status_resolvedAt_idx" ON "PredictionOutcome"("status", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionErrorAnalysis_predictionPickId_key" ON "PredictionErrorAnalysis"("predictionPickId");

-- CreateIndex
CREATE INDEX "PredictionErrorAnalysis_resultStatus_createdAt_idx" ON "PredictionErrorAnalysis"("resultStatus", "createdAt");
