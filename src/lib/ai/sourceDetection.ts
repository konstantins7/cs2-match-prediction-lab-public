export type LocalAiSourceSite = "hltv" | "liquipedia" | "esl" | "blast" | "other";

export function detectSource(text: string, sourceHint = ""): LocalAiSourceSite {
  const haystack = `${sourceHint}\n${text}`.toLowerCase();
  if (/hltv\.org|rating 2\.0|maps\s+played|veto/i.test(haystack) && haystack.includes("hltv")) return "hltv";
  if (/liquipedia\.net|liquipedia|current roster|transfer/i.test(haystack)) return "liquipedia";
  if (/esl\.com|esl pro league|intel extreme masters|iem/i.test(haystack)) return "esl";
  if (/blast\.tv|blast premier|blast open|blast/i.test(haystack)) return "blast";
  if (/hltv\.org/i.test(haystack)) return "hltv";
  return "other";
}

export function sourcePromptFragment(source: LocalAiSourceSite) {
  if (source === "hltv") {
    return [
      "Source-specific hint: HLTV copied pages often contain player tables with Rating 2.0, ADR, KAST, maps and match veto text.",
      "Treat HLTV team/player nicknames as authoritative only when they are visible in the provided text."
    ].join("\n");
  }
  if (source === "liquipedia") {
    return [
      "Source-specific hint: Liquipedia pages often emphasize roster, roles, substitutes, coaches and transfer dates.",
      "Do not convert coaches/substitutes into active players unless the text clearly marks them as current roster players."
    ].join("\n");
  }
  if (source === "esl") {
    return "Source-specific hint: ESL pages often contain event, match format, team names and sometimes map/veto metadata.";
  }
  if (source === "blast") {
    return "Source-specific hint: BLAST pages often contain event context, teams, schedule, match format and map metadata.";
  }
  return "Source-specific hint: Unknown source. Be conservative and leave arrays empty when data is ambiguous.";
}
