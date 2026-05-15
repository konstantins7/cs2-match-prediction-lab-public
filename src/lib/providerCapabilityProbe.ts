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

async function faceitCapability(): Promise<ProviderCapability> {
  const configured = envPresent("FACEIT_API_KEY");
  const enabled = configured && envFlag("ENABLE_FACEIT_SYNC");
  const status = adapterStatus("faceit");
  const checkedAt = new Date().toISOString();
  const base = {
    source: "faceit" as const,
    label: status?.label ?? "FACEIT API Optional",
    configured,
    enabled,
    requiresKey: true,
    checkedAt,
    rateLimit: status?.rateLimitRemaining === null || status?.rateLimitRemaining === undefined ? undefined : `${status.rateLimitRemaining} remaining`
  };

  if (!configured) {
    return {
      ...base,
      reachable: false,
      unlocked: [],
      blocked: ["FACEIT key missing"],
      friendlyMessage: "FACEIT не подключён. Добавьте developer API key."
    };
  }
  if (!enabled) {
    return {
      ...base,
      reachable: false,
      unlocked: ["key configured"],
      blocked: ["ENABLE_FACEIT_SYNC=false"],
      friendlyMessage: "FACEIT key настроен, но sync отключён."
    };
  }

  try {
    const response = await fetch("https://open.faceit.com/data/v4/championships?game=cs2&type=upcoming&limit=1", {
      headers: {
        Authorization: `Bearer ${process.env.FACEIT_API_KEY ?? ""}`,
        Accept: "application/json",
        "User-Agent": "CS2MatchPredictionLab/0.6.0 local research analytics"
      }
    });
    if (!response.ok) {
      return {
        ...base,
        reachable: false,
        unlocked: ["key configured"],
        blocked: [`FACEIT competitions probe returned HTTP ${response.status}`],
        friendlyMessage: response.status === 401 || response.status === 403
          ? "FACEIT key настроен, но API не авторизовал запрос."
          : "FACEIT API временно недоступен или вернул ошибку."
      };
    }
    return {
      ...base,
      reachable: true,
      unlocked: [
        "competitions endpoint reachable",
        "players route configured with explicit known player IDs only",
        "teams route configured with explicit team context",
        "player stats capability requires explicit known player context"
      ],
      blocked: ["no broad FACEIT crawl", "no FACEIT player search by nickname", "no FACEIT team search by name", "explicit IDs/context required"],
      friendlyMessage: "FACEIT API reachable. Используется как optional player/team/competition context, не Tier-1 deep source."
    };
  } catch {
    return {
      ...base,
      reachable: false,
      unlocked: ["key configured"],
      blocked: ["FACEIT reachability probe failed"],
      friendlyMessage: "FACEIT API временно недоступен."
    };
  }
}

export async function probeProviderCapabilities(): Promise<ProviderCapabilityProbeResult> {
  const checkedAt = new Date().toISOString();
  const [rankingDate, steamDate, hasParsedDemo, faceit] = await Promise.all([latestRankingDate(), latestSteamDate(), parsedDemoAvailable(), faceitCapability()]);
  const providers: ProviderCapability[] = [
    baseCapability("pandascore", ["fixtures", "teams", "players", "tournaments"], ["deep endpoints blocked/paid"], "PandaScore Free даёт fixture/basic context; deep stats недоступны на текущем тарифе."),
    baseCapability("valve-rankings", ["rankings available", "roster hints available", `latest ranking date: ${rankingDate}`], [], "Valve rankings доступны как ranking source и roster hints."),
    baseCapability("cs-updates", ["CS updates available", `latest patch/news date: ${steamDate}`], [], "Steam/CS Updates дают patch/meta context."),
    baseCapability(
      "grid",
      envPresent("GRID_API_KEY") ? ["key configured", "capability probe available"] : [],
      envPresent("GRID_API_KEY")
        ? ["Central Data not confirmed", "Series State not confirmed", "File Download not confirmed", "Series Events not confirmed", "deep telemetry pending access confirmation"]
        : ["GRID key missing", "Central Data unavailable", "Series State unavailable", "File Download unavailable", "Series Events unavailable"],
      envPresent("GRID_API_KEY")
        ? "GRID подключён, но deep telemetry недоступна/не подтверждена на текущем доступе."
        : "GRID не подключён. Добавьте API key в .env."
    ),
    baseCapability("liquipedia", envPresent("LIQUIPEDIA_API_KEY") ? ["roster capability", "tournament capability", "roster changes capability", "60 requests/hour guard"] : [], envPresent("LIQUIPEDIA_API_KEY") ? [] : ["LiquipediaDB key missing"], envPresent("LIQUIPEDIA_API_KEY") ? "LiquipediaDB доступ настроен с лимитом 60 requests/hour." : "LiquipediaDB не подключён. Можно запросить approved API access."),
    faceit,
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

