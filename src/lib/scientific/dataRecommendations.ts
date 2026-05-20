import type { DataRecommendation, PrivateAnalysisData } from "@/lib/math/types";

export function buildDataRecommendations(data: PrivateAnalysisData, input: { matchId: string; aiConfidence?: number | null }): DataRecommendation[] {
  const recommendations: DataRecommendation[] = [];
  if (data.roster.length < 10) {
    recommendations.push(recommendation(input.matchId, "roster", "high", "Roster incomplete", "Add five active players for each team. The fastest path is Local AI import from Liquipedia/HLTV text, then review and Apply.", "ai_import"));
  }
  if (data.playerStats.length < 10) {
    recommendations.push(recommendation(input.matchId, "player_stats", "high", "Player stats missing", "Add player ratings, ADR, KAST and impact for the last 30-90 days. Paste a stats table into Быстрый AI импорт or use player_stats.csv.", "ai_import"));
  }
  if (data.mapStats.length < 10) {
    recommendations.push(recommendation(input.matchId, "map_stats", "high", "Map statistics missing", "Upload map_stats for at least five recent maps per team. Extended research can help when team IDs are configured.", "research_extended"));
  }
  if (data.h2h.length < 1) {
    recommendations.push(recommendation(input.matchId, "h2h", "medium", "H2H context absent", "Add previous meetings or map-level H2H rows when available. This is advisory but improves matchup context.", "manual_csv"));
  }
  if (data.vetoHistory.length < 2) {
    recommendations.push(recommendation(input.matchId, "veto_history", "medium", "Veto history absent", "Paste pick/ban history or fill veto_history.csv so map scenario analysis can separate comfort picks from punish bans.", "ai_import"));
  }
  if (input.aiConfidence !== null && input.aiConfidence !== undefined && input.aiConfidence < 70) {
    recommendations.push(recommendation(input.matchId, "news_events", "low", "AI import confidence is low", "Repeat AI import with cleaner copied text, remove ads/navigation, or add missing blocks manually before Apply.", "ai_import"));
  }
  return recommendations;
}

function recommendation(
  matchId: string,
  block: DataRecommendation["block"],
  severity: DataRecommendation["severity"],
  title: string,
  action: string,
  sourceHint: DataRecommendation["sourceHint"]
): DataRecommendation {
  return {
    id: `${matchId}:${block}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    block,
    severity,
    title,
    action,
    sourceHint,
    completedKey: `cs2-rec:${matchId}:${block}:${title}`
  };
}
