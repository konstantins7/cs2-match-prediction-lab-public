import { sourceModeRu } from "@/lib/russianLabels";

const labels: Record<string, string> = {
  demo: sourceModeRu.demo,
  valve_rankings: sourceModeRu.valve_rankings,
  steam_updates: sourceModeRu.steam_updates,
  pandascore_free: sourceModeRu.pandascore_free,
  manual_real: sourceModeRu.manual_real,
  manual_reference: sourceModeRu.manual_reference,
  parsed_demo: sourceModeRu.parsed_demo,
  analyst_sample: sourceModeRu.analyst_sample,
  liquipedia_limited: sourceModeRu.liquipedia_limited,
  faceit_optional: sourceModeRu.faceit_optional,
  grid_open_access: sourceModeRu.grid_open_access,
  mixed: sourceModeRu.mixed,
  partial: sourceModeRu.partial,
  needs_review: sourceModeRu.needs_review
};

const classes: Record<string, string> = {
  demo: "border-lab-muted/40 text-lab-muted",
  valve_rankings: "border-lab-cyan/50 text-lab-cyan",
  steam_updates: "border-lab-cyan/50 text-lab-cyan",
  pandascore_free: "border-lab-cyan/50 text-lab-cyan",
  manual_real: "border-lab-green/50 text-lab-green",
  manual_reference: "border-lab-amber/60 text-lab-amber",
  parsed_demo: "border-lab-green/50 text-lab-green",
  analyst_sample: "border-violet-400/70 text-violet-300",
  liquipedia_limited: "border-lab-cyan/50 text-lab-cyan",
  faceit_optional: "border-lab-muted/50 text-lab-muted",
  grid_open_access: "border-lab-green/50 text-lab-green",
  mixed: "border-lab-amber/60 text-lab-amber",
  partial: "border-lab-amber/60 text-lab-amber",
  needs_review: "border-lab-red/60 text-lab-red"
};

export function SourceModeBadge({ sourceMode, needsReview }: { sourceMode?: string | null; needsReview?: boolean | null }) {
  const mode = needsReview ? "needs_review" : sourceMode ?? "demo";
  return (
    <span className={`rounded border px-2 py-1 text-xs uppercase ${classes[mode] ?? classes.partial}`}>
      {labels[mode] ?? "ЧАСТИЧНЫЕ ДАННЫЕ"}
    </span>
  );
}
