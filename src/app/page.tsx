import Link from "next/link";
import { DashboardStatusStrip } from "@/components/DashboardStatusStrip";
import { MatchCard } from "@/components/MatchCard";
import { getDashboardDataStatus } from "@/lib/data/dataCoverage";
import { getCalculatedMatches } from "@/lib/data/matches";
import { getReadinessDistribution } from "@/lib/data/readinessDistribution";

const filters = [
  ["Топовые матчи", "/matches"],
  ["Top 50", "/matches?focus=top50"],
  ["Top 100", "/matches?focus=top100"],
  ["Watchlist", "/matches?focus=watchlist"],
  ["Известные турниры", "/matches?focus=known"],
  ["All real", "/matches?focus=all_real"],
  ["Низший тир / академки", "/matches?focus=lower_tier"],
  ["Отдельный контур", "/matches?focus=separate_circuit"],
  ["Sample / Dev only", "/matches?focus=sample"]
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [upcoming, live, finished, status, readinessDistribution] = await Promise.all([
    getCalculatedMatches({ status: "upcoming", limit: 6, focus: "pro" }),
    getCalculatedMatches({ status: "live", limit: 3, focus: "pro" }),
    getCalculatedMatches({ status: "finished", limit: 3, focus: "pro" }),
    getDashboardDataStatus(),
    getReadinessDistribution()
  ]);
  const fullStatus = { ...status, readinessDistribution };

  return (
    <div className="space-y-6">
      <section className="rounded border border-lab-border bg-lab-panel p-5">
        <p className="text-sm uppercase tracking-wide text-lab-cyan">Research dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">CS2 Match Prediction Lab</h1>
        <p className="mt-2 max-w-3xl text-sm text-lab-muted">
          Вероятностная аналитика официальных CS2 матчей. Real/free источники показываются выше demo, а все проценты пересчитаны через calculatePrediction.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map(([filter, href]) => (
            <Link key={filter} href={href} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan hover:text-white">
              {filter}
            </Link>
          ))}
        </div>
      </section>

      <DashboardStatusStrip status={fullStatus} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Топовые матчи</h2>
          <Link href="/matches?status=upcoming&focus=all_real" className="text-sm text-lab-cyan">Все матчи</Link>
        </div>
        {upcoming.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {upcoming.map((row) => <MatchCard key={row.match.id} row={row} />)}
          </div>
        ) : (
          <div className="rounded border border-lab-border bg-lab-panel p-5">
            <h3 className="font-semibold text-white">Мало топовых матчей сейчас</h3>
            <p className="mt-2 text-sm text-lab-muted">Низший тир, академки, separate-circuit и demo не подмешиваются в Pro Focus молча.</p>
            <Link href="/matches?status=upcoming&focus=all_real" className="mt-3 inline-flex rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black">
              Показать все реальные матчи
            </Link>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-xl font-semibold text-white">Live Matches</h2>
          <div className="grid gap-4">
            {live.map((row) => <MatchCard key={row.match.id} row={row} />)}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-semibold text-white">Finished Matches</h2>
          <div className="grid gap-4">
            {finished.map((row) => <MatchCard key={row.match.id} row={row} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
