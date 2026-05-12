import { pct } from "@/lib/format";

export function ProbabilityBar({
  teamAName,
  teamBName,
  teamAProbability,
  teamBProbability
}: {
  teamAName: string;
  teamBName: string;
  teamAProbability: number;
  teamBProbability: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-lab-muted">
        <span>{teamAName}</span>
        <span>{teamBName}</span>
      </div>
      <div className="h-3 overflow-hidden rounded bg-lab-panel2 ring-1 ring-lab-border">
        <div className="h-full bg-gradient-to-r from-lab-green to-lab-cyan" style={{ width: `${teamAProbability}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{pct(teamAProbability)}</span>
        <span>{pct(teamBProbability)}</span>
      </div>
    </div>
  );
}
