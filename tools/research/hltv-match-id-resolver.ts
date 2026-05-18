import { hltvSlug, researchFetchText, stripTags, type ResearchFetchOptions } from "./hltv-client";

export type HltvMatchIdResolveOptions = ResearchFetchOptions & {
  teamA: string;
  teamB: string;
  date?: Date;
};

export type HltvMatchIdResult = {
  matchId: string;
  matchUrl: string;
  score: number;
};

export async function resolveHltvMatchId(options: HltvMatchIdResolveOptions): Promise<HltvMatchIdResult | null> {
  const url = buildHltvSearchUrl(options.teamA, options.teamB);
  const response = await researchFetchText(url, options);
  if (!response.body || response.status === "disabled" || response.status === "blocked" || response.status === "failed") return null;
  return extractHltvMatchId(response.body, options.teamA, options.teamB);
}

export function buildHltvSearchUrl(teamA: string, teamB: string) {
  const url = new URL("https://www.hltv.org/search");
  url.searchParams.set("query", `${teamA} ${teamB}`);
  return url.toString();
}

export function extractHltvMatchId(html: string, teamA: string, teamB: string): HltvMatchIdResult | null {
  const targetA = hltvSlug(teamA);
  const targetB = hltvSlug(teamB);
  const candidates: HltvMatchIdResult[] = [];
  const pattern = /<a\b[^>]*href=["'](\/matches\/(\d+)\/([^"']+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1] ?? "";
    const matchId = match[2] ?? "";
    const slug = hltvSlug(`${match[3] ?? ""} ${stripTags(match[4] ?? "")}`);
    const hasA = slug.includes(targetA) || targetA.split("-").every((part) => slug.includes(part));
    const hasB = slug.includes(targetB) || targetB.split("-").every((part) => slug.includes(part));
    const score = (hasA ? 0.5 : 0) + (hasB ? 0.5 : 0);
    if (matchId && score >= 0.75) candidates.push({ matchId, matchUrl: `https://www.hltv.org${href}`, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best?.score && best.score >= 0.75 ? best : null;
}
