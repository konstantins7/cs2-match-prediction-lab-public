# Local AI Import Assistant

The local AI import assistant turns copied CS2 match/stat pages, local text files, and screenshots into the existing analyst-sheet CSV format.

It is opt-in and runs through a local Ollama server only.

## Setup

1. Install Ollama from https://ollama.com.

Windows PowerShell installer:

```powershell
irm https://ollama.com/install.ps1 | iex
```

2. Pull a small local model:

```bash
ollama pull llama3.2:3b
```

3. Add local env flags:

```env
ENABLE_LOCAL_AI=true
LOCAL_AI_MODEL="llama3.2:3b"
LOCAL_AI_FINETUNED_MODEL="cs2-prediction-finetuned"
LOCAL_AI_BASE_URL="http://127.0.0.1:11434"
LOCAL_AI_TIMEOUT_MS=60000
AI_AUTO_APPLY_ENABLED=false
AI_AUTO_APPLY_MIN_CONFIDENCE=85
AI_AUTO_APPLY_DELAY_MS=5000
AI_HISTORY_RETAIN_DAYS=30
AI_HISTORY_INPUT_CHARS=500
AI_HISTORY_FULL_INPUT=false
AI_FINETUNE_ALLOW_RUN=false
```

4. Check readiness:

```bash
pnpm ai:setup
```

Pass `--pull` if you want the setup helper to run `ollama pull` for the configured model.

## Workflow

1. Open a match page.
2. Paste copied text/HTML/Markdown, upload a text file, or upload a screenshot.
3. For screenshots, confirm they contain no confidential information and run browser OCR.
4. Review/edit the recognized text, then click **Распознать локально**.
5. Review and edit the generated tables.
6. Click **Применить распознанные данные**.

Apply uses the existing analyst-sheet path and calls the same server-side validation as `/admin/imports`. There is no hidden Apply and no Real Forecast Ready gate change.

## AI dashboard and history

Open `/admin/ai-dashboard` to inspect the local AI subsystem:

- Ollama enabled/base URL/model status and visible model list.
- Test connection latency for a short local prompt.
- Queue/runtime counters, recent errors, cache count/size and clear-cache action.
- Usage from `data/logs/ai-local.log` over the last 24 hours.
- Accepted example count and guided fine-tuning actions.

Open `/admin/ai-history` to inspect extraction runs:

- Server-paginated history, 50 rows per page.
- Filters for match ID, source and status.
- Redacted/truncated input preview and raw output JSON for debugging.
- Mark bad examples to exclude them from future fine-tuning exports.
- Export CSV warns that match data may be included.

By default, history stores only metadata and a redacted input preview. Full input storage requires `AI_HISTORY_FULL_INPUT=true`.

## Improving input quality

- Prefer copied table text over screenshots when possible.
- Remove navigation, ads, unrelated comments and long article text before extraction.
- Include both team names and the match ID context if the copied page is ambiguous.
- For HLTV-like pages, copy roster, player stats, map stats and veto blocks together.
- If confidence is below 60%, review manually or run focused research gap-fill for missing blocks.

## Screenshots and OCR

- v1.4.0 uses lazy browser-side `tesseract.js` for PNG/JPG/WebP images up to 10 MB.
- The image stays in the browser; the server receives only the OCR text after you choose to extract.
- OCR is experimental. Low confidence or short extracted text should be corrected manually before AI extraction.
- Server-side image preprocessing with `sharp` is intentionally deferred to a later release.

Advanced local CLI fallback:

```bash
pnpm ocr:local -- --image screenshot.png --out recognized.txt
```

This command only works if the `tesseract` CLI is already installed in PATH.

## Timed Apply

Timed Apply is off by default. To allow it locally:

```env
AI_AUTO_APPLY_ENABLED=true
AI_AUTO_APPLY_MIN_CONFIDENCE=85
AI_AUTO_APPLY_DELAY_MS=5000
```

When enabled, the UI can show a visible countdown for high-confidence, validation-clean extractions. You can cancel before the existing `/api/ai/apply-local` endpoint is called. There is no server-side hidden Apply.

## Batch Import

Open `/admin/ai-batch` to process many local files.

- ZIP archives are unpacked in the browser via JSZip.
- Limits: 50 files, 50 MB ZIP, 120k characters per job.
- Executable/script files are rejected.
- Jobs run with a concurrency limit of 3 to avoid overloading a CPU-bound local model.
- Apply is only performed for selected, valid jobs.

Supported batch input:

- ZIP with `.txt`, `.html`, `.md`, or `.markdown`.
- Multiple direct text/HTML/Markdown files.
- JSON array: `[{ "matchId": "...", "teamA": "...", "teamB": "...", "inputText": "..." }]`.

## Fine-tuning prep

Fine-tuning is optional and advanced. It is not required for normal local AI import.

1. In the AI import UI, enable **save accepted example** only for examples you want to keep locally for training.
2. Apply the reviewed extraction.
3. Prepare ShareGPT-style JSONL:

```bash
pnpm ai:prepare-dataset
```

4. Optional local training orchestration:

```bash
pnpm ai:finetune
```

`ai:finetune` requires at least 50 accepted examples. It checks Python/tooling and prints setup guidance if dependencies are missing. It never installs Python, PyTorch, Unsloth, or Axolotl automatically.

In v1.5.0, `/admin/ai-dashboard` can run the same steps from the UI:

- **Prepare dataset** writes ShareGPT-style JSONL.
- **Run guided fine-tune** only works when `AI_FINETUNE_ALLOW_RUN=true` and `AI_FINETUNE_COMMAND` is configured.
- **Activate fine-tuned model** runs `ollama create` only when local artifacts and a Modelfile exist.
- **Reset** returns the app to the base model. The active preference is stored under ignored `data/model/`.

## Privacy

- Runtime extraction calls `http://127.0.0.1:11434/api/generate`.
- No cloud AI SDKs or hosted LLM endpoints are used.
- Technical metrics are written to `data/logs/ai-local.log` and `data/logs/ai-metrics.jsonl`.
- Match content is not written to metrics logs.
- Fine-tuning examples are stored only when explicitly opted in.

## Limits

- OCR quality depends on screenshot clarity and table layout.
- Fine-tuning requires local Python/LoRA tooling outside the app.
- AI output is advisory until the user reviews and applies it.
- Missing source data stays missing. The model is instructed not to invent players or stats.
