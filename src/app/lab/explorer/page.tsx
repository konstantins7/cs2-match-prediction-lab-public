import { prisma } from "@/lib/prisma";
import { getCalibrationByReadiness } from "@/lib/modelLab/calibration";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LabExplorerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(value(params.page) ?? 1));
  const q = value(params.q)?.trim() ?? "";
  const skip = (page - 1) * 50;
  const where = {
    status: "finished",
    ...(q ? {
      OR: [
        { eventName: { contains: q } },
        { teamA: { name: { contains: q } } },
        { teamB: { name: { contains: q } } }
      ]
    } : {})
  };
  const [matches, calibration] = await Promise.all([
    prisma.match.findMany({
      where,
      orderBy: { startTime: "desc" },
      skip,
      take: 50,
      select: {
        id: true,
        eventName: true,
        startTime: true,
        winnerTeamId: true,
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
        predictions: { orderBy: { createdAt: "desc" }, take: 1, select: { teamAProbability: true, teamBProbability: true, predictedWinnerId: true, confidenceScore: true } }
      }
    }),
    getCalibrationByReadiness()
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded border border-lab-border bg-lab-panel p-5">
        <h1 className="text-2xl font-semibold text-white">Lab Explorer</h1>
        <p className="mt-2 text-sm text-lab-muted">Исторические finished матчи, predicted vs actual и calibration bins. Страница читает только агрегаты и первую страницу по 50 матчей.</p>
        <form className="mt-4 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="Team or tournament" className="rounded border border-lab-border bg-lab-panel2 px-3 py-2 text-sm text-white" />
          <button className="rounded bg-lab-cyan px-3 py-2 text-sm font-semibold text-black">Search</button>
          <a className="rounded border border-lab-border px-3 py-2 text-sm text-lab-cyan" href="/api/admin/model-lab/training-dataset">Export training CSV</a>
        </form>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Reliability diagram bins</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {calibration.map((row) => (
            <article key={row.readinessLevel} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <p className="font-medium text-white">{row.readinessLevel}</p>
              <p className="mt-1 text-sm text-lab-muted">Sample {row.sampleSize} · accuracy {pct(row.accuracy)} · Brier {num(row.brierScore)} · ECE {num(row.ece)}</p>
              <div className="mt-2 flex h-20 items-end gap-1">
                {row.buckets.length ? row.buckets.map((bucket) => (
                  <div key={bucket.bucket} title={`${bucket.bucket}: ${pct(bucket.observedWinRate)}`} className="w-6 bg-lab-cyan/70" style={{ height: `${Math.max(6, bucket.observedWinRate * 76)}px` }} />
                )) : <p className="text-xs text-lab-muted">No bins</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-lab-muted"><tr><th className="py-2">Date</th><th>Match</th><th>Event</th><th>Prediction</th><th>Actual</th><th>Confidence</th></tr></thead>
            <tbody className="divide-y divide-lab-border">
              {matches.map((match) => {
                const prediction = match.predictions[0];
                const predicted = prediction?.predictedWinnerId === match.teamA.id ? match.teamA.name : prediction?.predictedWinnerId === match.teamB.id ? match.teamB.name : "n/a";
                const actual = match.winnerTeamId === match.teamA.id ? match.teamA.name : match.winnerTeamId === match.teamB.id ? match.teamB.name : "n/a";
                return (
                  <tr key={match.id}>
                    <td className="py-2 text-lab-muted">{formatDateTime(match.startTime)}</td>
                    <td className="text-white">{match.teamA.name} vs {match.teamB.name}</td>
                    <td>{match.eventName}</td>
                    <td>{predicted}{prediction ? ` (${Math.max(prediction.teamAProbability, prediction.teamBProbability)}%)` : ""}</td>
                    <td>{actual}</td>
                    <td>{prediction?.confidenceScore ?? "n/a"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex gap-2">
          {page > 1 ? <a className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-cyan" href={`/lab/explorer?page=${page - 1}&q=${encodeURIComponent(q)}`}>Previous</a> : null}
          <a className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-cyan" href={`/lab/explorer?page=${page + 1}&q=${encodeURIComponent(q)}`}>Next</a>
        </div>
      </section>
    </div>
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

function pct(value: number | null) {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function num(value: number | null) {
  return value === null ? "n/a" : value.toFixed(3);
}
