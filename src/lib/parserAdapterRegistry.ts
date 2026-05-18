export type ParserAdapterMode = "disabled" | "allowed_public_table" | "manual_reference" | "future";
export type ParserAdapterLegalStatus = "allowed" | "user_provided" | "forbidden" | "future";

export type ParserAdapterPolicy = {
  id: string;
  label: string;
  mode: ParserAdapterMode;
  legalStatus: ParserAdapterLegalStatus;
  canAutoRun: boolean;
  output: "draft_normalized_csv" | "none";
  limitations: string[];
};

export const parserAdapterRegistry: ParserAdapterPolicy[] = [
  {
    id: "generic_public_table_draft",
    label: "Generic public table draft adapter",
    mode: "disabled",
    legalStatus: "future",
    canAutoRun: false,
    output: "draft_normalized_csv",
    limitations: [
      "Disabled by default.",
      "No domain-specific selectors.",
      "No browser automation or crawler packages.",
      "Future output must go through normalized CSV validation before Apply."
    ]
  },
  {
    id: "private_normalized_output",
    label: "Private normalized output",
    mode: "manual_reference",
    legalStatus: "user_provided",
    canAutoRun: false,
    output: "draft_normalized_csv",
    limitations: [
      "External collection happens outside core.",
      "Core accepts only manually reviewed normalized CSV or JSON.",
      "No DB writes from extractor tools."
    ]
  },
  ...["hltv_automation", "telegram_collection", "apify_actor", "browser_crawler", "captcha_or_login_bypass"].map((id) => ({
    id,
    label: id.replace(/_/g, " "),
    mode: "disabled" as const,
    legalStatus: "forbidden" as const,
    canAutoRun: false,
    output: "none" as const,
    limitations: ["Forbidden by project source policy."]
  }))
];

const forbiddenHostHints = ["hltv", "telegram", "apify"];

export function parserAdapterPolicySummary() {
  return parserAdapterRegistry.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    mode: adapter.mode,
    legalStatus: adapter.legalStatus,
    canAutoRun: adapter.canAutoRun,
    output: adapter.output,
    limitations: adapter.limitations
  }));
}

export function isParserAdapterUrlAllowed(rawUrl: string) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return !forbiddenHostHints.some((hint) => host.includes(hint));
  } catch {
    return false;
  }
}

export function validateParserDraftRequest(params: { adapterId: string; url?: string; enabled?: boolean }) {
  const adapter = parserAdapterRegistry.find((item) => item.id === params.adapterId);
  if (!adapter) return { ok: false, reason: "Unknown parser adapter." };
  if (!adapter.canAutoRun || !params.enabled) return { ok: false, reason: "Parser adapter is disabled and cannot auto-run." };
  if (params.url && !isParserAdapterUrlAllowed(params.url)) return { ok: false, reason: "URL is forbidden by source policy." };
  if (adapter.output !== "draft_normalized_csv") return { ok: false, reason: "Adapter has no normalized CSV output path." };
  return { ok: true, reason: "Draft normalized CSV output allowed after validation." };
}
