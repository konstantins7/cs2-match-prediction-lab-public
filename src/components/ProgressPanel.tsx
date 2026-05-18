import type { AutoAllJobProgress } from "@/lib/autoAllJobs";

const sourceLabels: Record<AutoAllJobProgress["source"], string> = {
  csstats: "CSStats",
  pandascore: "PandaScore",
  grid: "GRID",
  steam: "Steam",
  liquipedia: "Liquipedia",
  private_inbox: "Private inbox"
};

const statusClass: Record<AutoAllJobProgress["status"], string> = {
  pending: "text-lab-muted",
  running: "text-lab-cyan",
  success: "text-lab-green",
  partial: "text-lab-amber",
  skipped: "text-lab-muted",
  failed: "text-lab-red"
};

export function ProgressPanel({ progress }: { progress: AutoAllJobProgress[] }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3">
      <p className="text-xs uppercase text-lab-muted">Auto-All progress</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {progress.map((item) => (
          <div key={item.source} className="rounded border border-lab-border bg-lab-panel p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-white">{sourceLabels[item.source]}</span>
              <span className={statusClass[item.status]}>{item.status}</span>
            </div>
            <p className="mt-1 text-lab-muted">{item.message}</p>
            {item.rows ? <p className="mt-1 text-xs text-lab-cyan">{item.rows} row(s)</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
