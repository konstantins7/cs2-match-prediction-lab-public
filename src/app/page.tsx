import Link from "next/link";
import { MatchCard } from "@/components/MatchCard";
import { getCalculatedMatches } from "@/lib/data/matches";

const filters = ["top-10", "top-20", "top-50", "top-100", "LAN only", "BO3 only", "сегодня", "завтра", "7 дней"];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [upcoming, live, finished] = await Promise.all([
    getCalculatedMatches({ status: "upcoming", limit: 6 }),
    getCalculatedMatches({ status: "live", limit: 3 }),
    getCalculatedMatches({ status: "finished", limit: 3 })
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded border border-lab-border bg-lab-panel p-5">
        <p className="text-sm uppercase tracking-wide text-lab-cyan">Research dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">CS2 Match Prediction Lab</h1>
        <p className="mt-2 max-w-3xl text-sm text-lab-muted">
          Вероятностная аналитика официальных CS2 матчей на фиктивных MVP-данных. Все проценты ниже пересчитаны через calculatePrediction.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link key={filter} href="/matches" className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan hover:text-white">
              {filter}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Upcoming Matches</h2>
          <Link href="/matches?status=upcoming" className="text-sm text-lab-cyan">Все upcoming</Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {upcoming.map((row) => <MatchCard key={row.match.id} row={row} />)}
        </div>
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
