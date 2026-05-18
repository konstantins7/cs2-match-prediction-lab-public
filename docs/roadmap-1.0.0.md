# MVP 1.0.0 Production Ready Roadmap

## Decision

Plan A is the selected path for MVP 1.0.0: production ready without HLTV automation.

The release goal is stable, honest, measurable coverage rather than pretending every match can be fully automated. The app should clearly show what was collected, which sources were used, what remains missing, and what manual fallback is required.

Plan B (limited HLTV automation) and Plan C (HLTV plus demos plus additional official APIs) are deferred to future policy/research branches. They are not part of the 1.0.0 production release.

## Phase 1: Stabilization & Benchmark

- [ ] Run `data:benchmark-auto-all` on 50 upcoming matches.
- [ ] Collect coverage statistics: Real Forecast Ready rate, nearly-ready rate, top blockers, source hit rates, and manual fallback count.
- [ ] Fix critical bugs found during the benchmark.
- [ ] Confirm `data:auto-all` remains dry-run safe when requested and does not imply guaranteed coverage.

## Phase 2: UI/UX Polish

- [ ] Add an “Auto-All” action on the home page and match page.
- [ ] Show source progress: private inbox, CSStats, GRID, PandaScore, Steam, Liquipedia.
- [ ] Display source lineage on the match page so analysts can see what data came from where.
- [ ] Add tooltips for confidence scores, roster hints, dry-run projections, and manual fallback actions.

## Phase 3: Documentation & Release

- [ ] Write a production setup guide covering API keys, env vars, private inbox, and safe auto-fill.
- [ ] Add a troubleshooting FAQ for missing keys, missing teams, failed CSStats lookup, and GRID no-match cases.
- [ ] Prepare release notes for MVP 1.0.0.
- [ ] Create a short demo walkthrough showing the zero-touch flow and the honest fallback path.

## Deferred

- HLTV automation: requires an explicit policy/research branch and is not included in MVP 1.0.0.
- ESL/BLAST live fetchers: deferred until official public endpoint docs and schemas are verified.
- Automated demo download: deferred because it requires external tooling and source-specific policy review.
