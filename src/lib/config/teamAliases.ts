export const TEAM_ALIASES: Record<string, string[]> = {
  "Natus Vincere": ["NAVI"],
  "Virtus.pro": ["VP"],
  "Ninjas in Pyjamas": ["NiP"],
  "G2 Esports": ["G2"],
  "FaZe Clan": ["FaZe"],
  "The MongolZ": ["TheMongolz", "MongolZ"],
  "Team Liquid": ["Liquid"],
  "Team Vitality": ["Vitality"],
  "Team Spirit": ["Spirit"],
  "Team Falcons": ["Falcons"],
  Monte: [],
  "BetBoom Team": ["BetBoom"],
  "Aurora Gaming": ["Aurora"],
  fnatic: [],
  ENCE: [],
  SAW: [],
  M80: [],
  PARIVISION: []
};

export const PROTECTED_ALIAS_VARIANTS = [
  "academy",
  "junior",
  "ares",
  "nxt",
  "prospects",
  "young"
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isProtectedTeamVariant(teamName: string) {
  const normalized = normalize(teamName);
  return PROTECTED_ALIAS_VARIANTS.some((term) => new RegExp(`(^| )${term}( |$)`).test(normalized));
}

export function aliasesForTeamName(teamName: string) {
  if (isProtectedTeamVariant(teamName)) return [];
  const direct = TEAM_ALIASES[teamName] ?? [];
  const reverse = Object.entries(TEAM_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => alias.toLowerCase() === teamName.toLowerCase()))
    .map(([canonical]) => canonical);
  return [...new Set([...direct, ...reverse])];
}
