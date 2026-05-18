# Local ML Experiments Placeholder

This folder is reserved for future local-only model experiments.

Current MVP 0.8.7 scope is limited to read-only dataset export from existing
`MatchFeatureSnapshot` rows. Production forecast math, Real Forecast Ready
gates and model weights are not changed here.

Rules:

- no automatic retraining;
- no automatic weight changes;
- no scikit-learn/Python runtime dependency in this phase;
- exported datasets must keep cutoff/leakage filters and exclude sample-only
  evidence from production scoring.
