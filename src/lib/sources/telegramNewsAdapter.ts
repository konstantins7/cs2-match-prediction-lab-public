import { resultFromRecords } from "./adapterUtils";
import type { SourceAdapter } from "./types";
import { buildSourceStatus, disabledResult, envFlag, SOURCE_PRIORITY } from "./types";

const source = "telegram-news" as const;
const capabilities = ["news", "manual"] as const;

export const telegramNewsAdapter: SourceAdapter = {
  name: source,
  label: "Telegram News Watchlist (manual/API only)",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv: ["ENABLE_TELEGRAM_NEWS_SYNC"],
  status() {
    const enabled = envFlag("ENABLE_TELEGRAM_NEWS_SYNC");
    return buildSourceStatus({
      source,
      label: "Telegram News Watchlist",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv: ["ENABLE_TELEGRAM_NEWS_SYNC"],
      enabled,
      configured: enabled,
      message: enabled
        ? "Telegram news sync skeleton is enabled, but MVP 0.7.4 supports only official API/bot/user-approved sources. No scraping/private channels."
        : "Disabled by default. Telegram insider signals are manual/reference-only in MVP 0.7.4.",
      endpointsAvailable: enabled ? ["manual://telegram-insider-note"] : [],
      endpointsBlocked: ["HTML/channel scraping", "private channels", "ML training/fine-tuning use"]
    });
  },
  async sync(context) {
    if (!envFlag("ENABLE_TELEGRAM_NEWS_SYNC")) {
      return disabledResult(source, context.jobType, "ENABLE_TELEGRAM_NEWS_SYNC=false: Telegram sync disabled by default; use manual insider import.");
    }
    return resultFromRecords({
      source,
      jobType: context.jobType,
      records: [],
      status: "blocked",
      errors: ["Telegram automatic collection is not implemented in MVP 0.7.4. Use official API/bot/user-approved manual imports only."],
      notes: "No Telegram scraping, no private channels, no ML training/fine-tuning use.",
      method: "DISABLED",
      endpoint: "manual://telegram-news"
    });
  }
};

