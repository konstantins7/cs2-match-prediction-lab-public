import { prisma } from "./prisma";
import { GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS, probeGridOpenAccess } from "./gridOpenAccess";
import { redactSecrets, safeJson } from "./security/redaction";
import { sourceAdapters } from "./sources";
import { envFlag, envPresent, type SourceName } from "./sources/types";

// GRID Open Access unsupported products: Series Events API, File Download API, Stats Feed.
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

async function faceitCapability(fetchImpl: typeof fetch = fetch): Promise<ProviderCapability> {
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
    const response = await fetchImpl("https://open.faceit.com/data/v4/championships?game=cs2&type=upcoming&limit=1", {
      headers: {
        Authorization: `Bearer ${process.env.FACEIT_API_KEY ?? ""}`,
        Accept: "application/json",
        "User-Agent": "CS2MatchPredictionLab/0.7.3 local research analytics"
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

async function gridCapability(fetchImpl: typeof fetch = fetch): Promise<ProviderCapability> {
  const status = adapterStatus("grid");
  const checkedAt = new Date().toISOString();
  const probe = await probeGridOpenAccess(fetchImpl);
  const blocked = [
    ...GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS.map((name) => `${name} unavailable on Open Access`),
    ...(probe.seriesStateReachable === "pending" ? ["Series State pending until a known series id is available"] : []),
    ...probe.errors
  ];
  return {
    source: "grid",
    label: status?.label ?? "GRID Open Access",
    configured: probe.configured,
    enabled: probe.enabled,
    reachable: probe.centralDataReachable || probe.seriesStateReachable === true,
    unlocked: [
      ...(probe.centralDataReachable ? [`Central Data reachable`, `allSeries fetched: ${probe.allSeriesFetchedCount}`] : []),
      ...(probe.seriesStateReachable === true ? ["Series State reachable"] : []),
      ...(probe.sampleSeriesId ? [`sample series id available`] : [])
    ],
    blocked,
    requiresKey: true,
    friendlyMessage: probe.enabled
      ? probe.centralDataReachable
        ? probe.seriesStateReachable === true
          ? "GRID Open Access подключён. Доступны Central Data / Series State. Deep events/file download/stats feed недоступны на OA."
          : "GRID Open Access подключён. Central Data доступен; Series State пока не проверен без known series id. Deep events/file download/stats feed недоступны на OA."
        : "GRID key настроен, но Central Data пока недоступен или вернул ошибку."
      : probe.configured
        ? "GRID key настроен, но ENABLE_GRID_SYNC=false."
        : "GRID не подключён. Добавьте API key в .env.",
    checkedAt,
    rateLimit: status?.rateLimitRemaining === null || status?.rateLimitRemaining === undefined ? undefined : `${status.rateLimitRemaining} remaining`
  };
}

export async function probeProviderCapabilities(fetchImpl: typeof fetch = fetch): Promise<ProviderCapabilityProbeResult> {
  const checkedAt = new Date().toISOString();
  const [rankingDate, steamDate, hasParsedDemo, faceit, grid] = await Promise.all([latestRankingDate(), latestSteamDate(), parsedDemoAvailable(), faceitCapability(fetchImpl), gridCapability(fetchImpl)]);
  const providers: ProviderCapability[] = [
    baseCapability("pandascore", ["fixtures", "teams", "players", "tournaments"], ["deep endpoints blocked/paid"], "PandaScore Free даёт fixture/basic context; deep stats недоступны на текущем тарифе."),
    baseCapability("valve-rankings", ["rankings available", "roster hints available", `latest ranking date: ${rankingDate}`], [], "Valve rankings доступны как ranking source и roster hints."),
    baseCapability("cs-updates", ["CS updates available", `latest patch/news date: ${steamDate}`], [], "Steam/CS Updates дают patch/meta context."),
    grid,
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

