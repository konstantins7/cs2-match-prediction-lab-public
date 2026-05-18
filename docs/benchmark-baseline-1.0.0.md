# Benchmark Baseline for MVP 1.0.0

**Date:** 2026-05-18
**Matches analyzed:** 29
**Mode:** deeper, dry-run

## Overall Results

| Metric | Count | Rate |
|--------|-------|------|
| Real Forecast Ready | 0 | 0% |
| Nearly Ready | 1 | 3% |
| Manual Fallback Required | 29 | 100% |
| Average time per match | 208 ms | - |

## Top Blockers

1. map stats sample below gate (29 matches)
2. map_stats.csv (29 matches)
3. player_stats.csv (29 matches)
4. veto_history.csv (29 matches)
5. missing player stats (28 matches)

## Source Hit Rates

| Source | Success | Partial | Skipped | Failed |
|--------|---------|---------|---------|--------|
| csstats-auto-lookup | 0 (0%) | 0 (0%) | 29 (100%) | 0 (0%) |
| grid-enhanced | 0 (0%) | 29 (100%) | 0 (0%) | 0 (0%) |
| liquipedia | 0 (0%) | 0 (0%) | 29 (100%) | 0 (0%) |
| pandascore-enhanced | 0 (0%) | 0 (0%) | 29 (100%) | 0 (0%) |
| steam-web-api | 0 (0%) | 0 (0%) | 29 (100%) | 0 (0%) |

## Product Conclusion for 1.0.0

- Auto-All baseline starts from 0% Real Forecast Ready before auto-fill attempts.
- Manual fallback remains required for 100% of checked matches in this dry-run benchmark.
- The most frequent blocker is: map stats sample below gate.
- MVP 1.0.0 UI should show source progress, confidence, blockers, and manual CSV fallback without promising guaranteed coverage.
