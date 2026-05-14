export function friendlySourceError(source: string, message?: string | null) {
  const text = `${source} ${message ?? ""}`.toLowerCase();
  if (/grid/.test(text)) return "GRID не настроен";
  if (/api[_\s-]?key|not configured|missing env|unauthorized|401/.test(text)) return "Нет ключа API";
  if (/403|paid|required|plan|blocked|forbidden/.test(text)) return "Endpoint недоступен на текущем тарифе";
  if (/valve/.test(text)) return "Valve ranking не обновился";
  if (/steam|cs-updates|updates/.test(text)) return "Steam updates не обновились";
  if (/pandascore/.test(text)) return "PandaScore временно недоступен";
  return "Источник временно недоступен";
}

export function summarizeSourceFailures(items: Array<{ source: string; status?: string; errors?: string[]; notes?: string | null }>) {
  return items
    .filter((item) => item.status === "failed" || item.status === "blocked" || item.status === "disabled")
    .map((item) => ({
      source: item.source,
      status: item.status ?? "failed",
      message: friendlySourceError(item.source, item.errors?.[0] ?? item.notes)
    }));
}
