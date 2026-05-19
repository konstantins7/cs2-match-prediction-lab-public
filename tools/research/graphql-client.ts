import { redactUrl, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { hltvResearchUserAgent, isResearchEnabled } from "./hltv-client";

export type GraphqlQueryOptions = {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  allowedHosts: string[];
  sourceFlag?: string;
};

export async function graphqlQuery(endpoint: string, query: string, variables: Record<string, unknown> = {}, options: GraphqlQueryOptions) {
  const env = options.env ?? process.env;
  const sourceFlag = options.sourceFlag ?? "ENABLE_GRAPHQL_DISCOVERY";
  if (!isResearchEnabled(env, sourceFlag)) {
    return { status: "skipped" as const, data: null as unknown, warnings: [`Research source is disabled: ${sourceFlag}.`] };
  }
  const url = new URL(endpoint);
  if (!options.allowedHosts.map((host) => host.toLowerCase()).includes(url.hostname.toLowerCase())) {
    return { status: "failed" as const, data: null as unknown, warnings: ["GraphQL endpoint host is outside the allowlist."] };
  }
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": hltvResearchUserAgent
      },
      body: JSON.stringify({ query, variables })
    });
    if (!response.ok) return { status: "failed" as const, data: null as unknown, warnings: [`GraphQL endpoint returned HTTP ${response.status} for ${redactUrl(endpoint)}.`] };
    const payload = await response.json() as { data?: unknown; errors?: unknown };
    if (payload.errors) return { status: "failed" as const, data: null as unknown, warnings: ["GraphQL endpoint returned errors."] };
    return { status: "success" as const, data: payload.data ?? null, warnings: [] as string[] };
  } catch (error) {
    return { status: "failed" as const, data: null as unknown, warnings: [error instanceof Error ? error.message : "GraphQL request failed."] };
  }
}
