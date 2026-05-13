export function RealForecastBadge({ isReady }: { isReady: boolean }) {
  return (
    <span className={isReady ? "rounded border border-lab-green/60 px-2 py-1 text-xs text-lab-green" : "rounded border border-lab-amber/60 px-2 py-1 text-xs text-lab-amber"}>
      Real Forecast Ready: {isReady ? "yes" : "no"}
    </span>
  );
}

export function SourceLevelBadge({ sourceLevel }: { sourceLevel: string }) {
  const sample = sourceLevel === "Sample only";
  const analytical = sourceLevel === "Manual real analytical" || sourceLevel === "Deep data";
  return (
    <span className={sample ? "rounded border border-violet-400/70 px-2 py-1 text-xs text-violet-300" : analytical ? "rounded border border-lab-green/60 px-2 py-1 text-xs text-lab-green" : "rounded border border-lab-border px-2 py-1 text-xs text-lab-muted"}>
      {sourceLevel}
    </span>
  );
}
