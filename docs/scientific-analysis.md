# Scientific Analysis

The scientific layer is advisory. It reads local normalized data, cache tables, and finished-match feature history, but it does not change production `calculatePrediction`, Apply policy, or Real Forecast Ready gates.

## v1.6 Smart Analytics

- `GET /api/match-analysis/[matchId]?mode=deep&v=2` returns player-map efficiency, synergy, Bayesian map probabilities, AI provenance, similar matches, anomalies, advisory model comparison, and data recommendations.
- `GET /api/match/[matchId]/similar?limit=10` returns cached similar finished matches with reasons.
- `pnpm sync:match-features` rebuilds `MatchFeatureHistory` for finished matches. This is explicit and never runs on page load.

## Similar Matches

Similarity combines map-pool overlap, roster names, average player rating, recent win rate, tournament tier, LAN/online context, and shared teams. If the cache has too few finished matches, the API returns fewer candidates with a warning.

## Anomaly Detection

Anomalies use local-only thresholds:

- player rating, ADR, and KAST z-score deviations;
- unusual team map win rates;
- veto patterns such as banning a statistically strong map;
- roster-size or recent-change warnings.

Findings are explanations for analysts, not forecast gates.

## Model Comparison

The comparison block uses existing local math only:

- Elo: logistic transform of internal Elo difference;
- Bayesian maps: average Bayesian map probability;
- Weighted: existing scientific weighted components;
- Ensemble: arithmetic average of the first three.

No XGBoost, TensorFlow, cloud AI, or new ML dependency is used in v1.6.0.

## Report Export

The match page can export a print-friendly HTML report. Use browser Print / Save as PDF for PDF output. Native PDF generation is intentionally deferred.
