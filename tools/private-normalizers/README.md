# Private Normalized Extractor Pack

Local-only helpers for preparing normalized CSV files for `data/private-inbox/`.

These tools do not collect data from websites. They only transform user-pasted table text or local saved CSV/text files into the CSV schemas already accepted by the app. The core app remains responsible for validation, preview and apply.

## Safety Rules

- No HTTP requests.
- No browser automation.
- No Apify.
- No crawler or bypass code.
- No fake or imputed rows.
- No direct database writes.
- No app Apply calls.
- `data/private-inbox/` stays ignored by git.

## Supported Outputs

- `roster.csv`
- `player_stats.csv`
- `map_stats.csv`
- `veto_history.csv`

`team_form.csv` is documented as a future/schema-only format in this release because the app does not expose a standalone apply path for it yet.

All generated files include the required app columns plus optional `sourceUrl` lineage. Missing `sourceUrl` is a warning, not a hard blocker.

## Examples

```bash
tsx tools/private-normalizers/scripts/normalize_generic_table_paste.ts \
  --type player_stats \
  --matchId pandascore_match_1488973 \
  --teamName "Evo Novo" \
  --sourceName "HLTV copied table" \
  --sourceUrl "https://www.hltv.org/..." \
  --collectedAt "2026-05-17T10:00:00Z" \
  --period "last_3_months" \
  --confidence 65 \
  --input ./tmp/evo_players.txt \
  --out data/private-inbox/player_stats.csv
```

```bash
tsx tools/private-normalizers/scripts/normalize_hltv_table_paste.ts \
  --type map_stats \
  --matchId pandascore_match_1488973 \
  --teamName "Evo Novo" \
  --sourceName "HLTV copied table" \
  --collectedAt "2026-05-17T10:00:00Z" \
  --period "last_3_months" \
  --confidence 65 \
  --input ./tmp/evo_maps.txt
```

```bash
tsx tools/private-normalizers/scripts/validate_normalized_file.ts \
  --type map_stats \
  --input data/private-inbox/map_stats.csv
```

## File Write Policy

The default is safe:

- if the target file already exists, the script stops;
- use `--append` to add rows;
- use `--replace` to overwrite;
- use `--out <filename>` to write a different file.

Exact app-visible inbox names are `roster.csv`, `player_stats.csv`, `map_stats.csv`, and `veto_history.csv`. Draft filenames are allowed, but `/admin/imports` will only auto-detect accepted basenames.
