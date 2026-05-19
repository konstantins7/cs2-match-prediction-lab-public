-- Add explicit-action forecastability cache fields for lightweight match pages.
ALTER TABLE "Match" ADD COLUMN "cachedCoverageScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "cachedForecastabilityTier" TEXT;
ALTER TABLE "Match" ADD COLUMN "cachedForecastabilityAt" DATETIME;
ALTER TABLE "Match" ADD COLUMN "cachedForecastabilityVersion" TEXT;

CREATE INDEX "Match_cachedForecastabilityTier_idx" ON "Match"("cachedForecastabilityTier");
