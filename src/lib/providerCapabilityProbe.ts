import { prisma } from "./prisma";
import { redactSecrets, safeJson } from "./security/redaction";
import { sourceAdapters } from "./sources";
import { envFlag, envPresent, type SourceName } from "./sources/types";

export type ProviderCapability = {
  source: SourceName | "parsed-demo";
  label: string;
  configured: boolean;
  enabled: boolean;
  reachable: boolean;
  unlocked: string[];
  blocked: string[];
  requiresKey: boolean;
  rateLimit?: string;
  friendlyMessage: string;
  checkedAt: string;
};

export type ProviderCapabilityProbeResult = {
  checkedAt: string;
  providers: ProviderCapability[];
};

function adapterStatus(source: SourceName) {
  return sourceAdapters.find((adapter) => adapter.name === source)?.status();
}

async function latestRankingDate() {
  const row = await prisma.teamRankSnapshot.findFirst({ orderBy: { rankingDate: "desc" }, select: { rankingDate: true } });
  return row?.rankingDate?.toISOString() ?? "нет сохранённых ranking snapshots";
}

async function latestSteamDate() {
  const row = await prisma.externalSourceRecord.findFirst({ where: { source: "cs-updates" }, orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } });
  return row?.fetchedAt?.toISOString() ?? "нет сохранённых CS updates";
}

async function parsedDemoAvailable() {
  const rows = await Promise.all([
    prisma.playerStatSnapshot.count({ where: { source: "parsed_demo", isActive: true } }),
    prisma.teamMapStat.count({ where: { source: "parsed_demo", isActive: true } })
  ]);
  return rows.reduce((sum, value) => sum + value, 0) > 0;
}

function baseCapability(source: SourceName, unlocked: string[], blocked: string[], message: string): ProviderCapability {
  const status = adapterStatus(source);
  return {
    source,
    label: status?.label ?? source,
    configured: Boolean(status?.configured),
    enabled: Boolean(status?.enabled),
    reachable: Boolean(status?.enabled || status?.configured),
    unlocked,
    blocked,
    requiresKey: Boolean(status?.requiredEnv?.some((env) => env.includes("KEY"))),
    friendlyMessage: message,
    checkedAt: new Date().toISOString(),
    rateLimit: status?.rateLimitRemaining === null || status?.rateLimitRemaining === undefined ? undefined : `${status.rateLimitRemaining} remaining`
  };
}

export async function probeProviderCapabilities(): Promise<ProviderCapabilityProbeResult> {
  const checkedAt = new Date().toISOString();
  const [rankingDate, steamDate, hasParsedDemo] = await Promise.all([latestRankingDate(), latestSteamDate(), parsedDemoAvailable()]);
  const providers: ProviderCapability[] = [
    baseCapability("pandascore", ["fixtures", "teams", "players", "tournaments"], ["deep endpoints blocked/paid"], "PandaScore Free даёт fixture/basic context; deep stats недоступны на текущем тарифе."),
    baseCapability("valve-rankings", ["rankings available", "roster hints available", `latest ranking date: ${rankingDate}`], [], "Valve rankings доступны как ranking source и roster hints."),
    baseCapability("cs-updates", ["CS updates available", `latest patch/news date: ${steamDate}`], [], "Steam/CS Updates дают patch/meta context."),
    baseCapability("grid", envPresent("GRID_API_KEY") ? ["Central Data access-dependent", "Series State access-dependent", "File Download access-dependent", "Series Events access-dependent", "round/player/economy telemetry prepared"] : [], envPresent("GRID_API_KEY") ? [] : ["GRID key missing"], envPresent("GRID_API_KEY") ? "GRID key настроен; endpoint mapping остаётся access-dependent." : "GRID не подключён. Добавьте API key в .env."),
    baseCapability("liquipedia", envPresent("LIQUIPEDIA_API_KEY") ? ["roster capability", "tournament capability", "roster changes capability", "60 requests/hour guard"] : [], envPresent("LIQUIPEDIA_API_KEY") ? [] : ["LiquipediaDB key missing"], envPresent("LIQUIPEDIA_API_KEY") ? "LiquipediaDB доступ настроен с лимитом 60 requests/hour." : "LiquipediaDB не подключён. Можно запросить approved API access."),
    baseCapability("faceit", envPresent("FACEIT_API_KEY") ? ["players", "teams", "competitions", "player stats capability"] : [], envPresent("FACEIT_API_KEY") ? [] : ["FACEIT key missing"], envPresent("FACEIT_API_KEY") ? "FACEIT API key настроен для optional context." : "FACEIT не подключён. Добавьте developer API key."),
    {
      source: "parsed-demo",
      label: "Parsed demo",
      configured: true,
      enabled: true,
      reachable: true,
      unlocked: [hasParsedDemo ? "parsed_demo JSON records present" : "parsed_demo JSON import available"],
      blocked: [".dem parser worker not available"],
      requiresKey: false,
      friendlyMessage: "Сейчас доступен parsed_demo JSON. .dem parser будет добавлен позже.",
      checkedAt
    }
  ];

  for (const provider of providers.filter((item) => item.source !== "parsed-demo")) {
    await prisma.sourceHealth.upsert({
      where: { source: provider.source },
      create: {
        source: provider.source,
        status: provider.enabled ? "partial" : "disabled",
        notes: redactSecrets(provider.friendlyMessage),
        lastRawSampleJson: safeJson(provider),
        lastRecordsFetched: 0
      },
      update: {
        status: provider.enabled ? "partial" : "disabled",
        notes: redactSecrets(provider.friendlyMessage),
        lastRawSampleJson: safeJson(provider)
      }
    });
  }

  return { checkedAt, providers };
}

export function optionalApiActive() {
  return (envPresent("GRID_API_KEY") && envFlag("ENABLE_GRID_SYNC")) ||
    (envPresent("LIQUIPEDIA_API_KEY") && envFlag("ENABLE_LIQUIPEDIA_SYNC")) ||
    (envPresent("FACEIT_API_KEY") && envFlag("ENABLE_FACEIT_SYNC"));
}
