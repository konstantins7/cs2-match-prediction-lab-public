# Local AI Import Assistant

The local AI import assistant is a text-first helper for turning copied CS2 match/stat pages into the existing analyst-sheet CSV format.

It is opt-in and runs through a local Ollama server only.

## Setup

1. Install Ollama from https://ollama.com.
2. Pull a small local model:

```bash
ollama pull llama3.2:3b
```

3. Add local env flags:

```env
ENABLE_LOCAL_AI=true
LOCAL_AI_MODEL="llama3.2:3b"
LOCAL_AI_BASE_URL="http://127.0.0.1:11434"
LOCAL_AI_TIMEOUT_MS=30000
```

4. Check readiness:

```bash
pnpm ai:setup
```

Pass `--pull` if you want the setup helper to run `ollama pull` for the configured model.

## Workflow

1. Open a match page.
2. Paste copied text, HTML, or Markdown into **Быстрый AI импорт**.
3. Click **Распознать локально**.
4. Review and edit the generated tables.
5. Click **Применить распознанные данные**.

Apply uses the existing analyst-sheet path and calls the same server-side validation as `/admin/imports`. There is no hidden Apply and no Real Forecast Ready gate change.

## Privacy

- Runtime extraction calls `http://127.0.0.1:11434/api/generate`.
- No cloud AI SDKs or hosted LLM endpoints are used.
- Technical metrics are written to `data/logs/ai-local.log` and `data/logs/ai-metrics.jsonl`.
- Match content is not written to metrics logs.

## Limits

- v1.3.0 supports text, `.txt`, `.html`, and `.md` only.
- Screenshots/OCR are deferred to v1.4.0.
- AI output is advisory until the user reviews and applies it.
- Missing source data stays missing. The model is instructed not to invent players or stats.
