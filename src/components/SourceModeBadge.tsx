const labels: Record<string, string> = {
  demo: "DEMO DATA",
  valve_rankings: "VALVE RANKING",
  steam_updates: "REAL DATA",
  pandascore_free: "PANDA FREE",
  manual_real: "MANUAL REAL",
  parsed_demo: "REAL DATA",
  analyst_sample: "SAMPLE DATA",
  mixed: "MIXED SOURCES",
  partial: "PARTIAL DATA",
  needs_review: "NEEDS REVIEW"
};

const classes: Record<string, string> = {
  demo: "border-lab-muted/40 text-lab-muted",
  valve_rankings: "border-lab-cyan/50 text-lab-cyan",
  steam_updates: "border-lab-cyan/50 text-lab-cyan",
  pandascore_free: "border-lab-cyan/50 text-lab-cyan",
  manual_real: "border-lab-green/50 text-lab-green",
  parsed_demo: "border-lab-green/50 text-lab-green",
  analyst_sample: "border-violet-400/70 text-violet-300",
  mixed: "border-lab-amber/60 text-lab-amber",
  partial: "border-lab-amber/60 text-lab-amber",
  needs_review: "border-lab-red/60 text-lab-red"
};

export function SourceModeBadge({ sourceMode, needsReview }: { sourceMode?: string | null; needsReview?: boolean | null }) {
  const mode = needsReview ? "needs_review" : sourceMode ?? "demo";
  return (
    <span className={`rounded border px-2 py-1 text-xs uppercase ${classes[mode] ?? classes.partial}`}>
      {labels[mode] ?? "PARTIAL DATA"}
    </span>
  );
}
