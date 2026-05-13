export type KnownTournamentRule = {
  pattern: string;
  tier: "S" | "A" | "B";
  importanceScore: number;
  conditional?: boolean;
};

export const KNOWN_TOURNAMENTS: KnownTournamentRule[] = [
  { pattern: "Major", tier: "S", importanceScore: 95 },
  { pattern: "Austin Major", tier: "S", importanceScore: 96 },
  { pattern: "IEM", tier: "S", importanceScore: 90 },
  { pattern: "Intel Extreme Masters", tier: "S", importanceScore: 90 },
  { pattern: "ESL Pro League", tier: "S", importanceScore: 88 },
  { pattern: "ESL", tier: "A", importanceScore: 76 },
  { pattern: "BLAST Premier", tier: "S", importanceScore: 90 },
  { pattern: "BLAST", tier: "S", importanceScore: 86 },
  { pattern: "PGL", tier: "S", importanceScore: 84 },
  { pattern: "StarLadder", tier: "A", importanceScore: 78 },
  { pattern: "DreamHack", tier: "A", importanceScore: 72 },
  { pattern: "CCT Finals", tier: "B", importanceScore: 48, conditional: true },
  { pattern: "CCT", tier: "B", importanceScore: 40, conditional: true },
  { pattern: "Thunderpick World Championship", tier: "B", importanceScore: 46, conditional: true },
  { pattern: "YaLLa Compass", tier: "B", importanceScore: 46, conditional: true },
  { pattern: "BetBoom Dacha", tier: "B", importanceScore: 50, conditional: true },
  { pattern: "Skyesports Masters", tier: "B", importanceScore: 42, conditional: true }
];
