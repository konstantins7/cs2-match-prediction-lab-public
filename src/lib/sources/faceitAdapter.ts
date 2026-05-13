import type { SourceAdapter } from "./types";
import { buildSourceStatus, disabledResult, envFlag, envPresent, SOURCE_PRIORITY } from "./types";

const source = "faceit" as const;

export const faceitAdapter: SourceAdapter = {
  name: source,
  label: "FACEIT API Optional",
  priority: SOURCE_PRIORITY[source],
  capabilities: ["matches", "players"],
  requiredEnv: ["ENABLE_FACEIT_SYNC"],
  status() {
    const enabled = envFlag("ENABLE_FACEIT_SYNC") && envPresent("FACEIT_API_KEY");
    return buildSourceStatus({
      source,
      label: "FACEIT API Optional",
      priority: SOURCE_PRIORITY[source],
      capabilities: ["matches", "players"],
      requiredEnv: ["ENABLE_FACEIT_SYNC"],
      enabled,
      configured: enabled,
      message: enabled ? "FACEIT optional sync is configured, but not implemented in MVP 0.3.1." : "Disabled: FACEIT is optional and not a full Tier-1 pro CS2 source."
    });
  },
  async sync(context) {
    return disabledResult(source, context.jobType, "FACEIT optional adapter is intentionally disabled in MVP 0.3.1.");
  }
};
