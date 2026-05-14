import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      team: true,
      statSnapshots: { take: 1, orderBy: { createdAt: "desc" } },
      roleSnapshots: { take: 7, orderBy: { date: "desc" } },
      newsItems: { take: 5, orderBy: { publishedAt: "desc" } }
    }
  });
  if (!player) notFound();
  const stat = player.statSnapshots[0];
  const trend = !stat ? "unknown data" : stat.volatilityScore > 0.55 ? "volatile" : stat.trendScore > 0.05 ? "rising" : stat.trendScore < -0.05 ? "declining" : "stable";

  return (
    <div className="space-y-5">
      <section className="rounded border border-lab-border bg-lab-panel p-5">
        <p className="text-sm uppercase tracking-wide text-lab-cyan">{player.role}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{player.nickname}</h1>
        <p className="mt-2 text-sm text-lab-muted">{player.team?.name ?? "No team"} · {player.country} · trend {trend}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <Stat label="K/D" value={stat?.kd.toFixed(2) ?? "-"} />
          <Stat label="Rating" value={stat?.rating.toFixed(2) ?? "-"} />
          <Stat label="ADR" value={stat?.adr.toFixed(1) ?? "-"} />
          <Stat label="Impact" value={stat?.impact.toFixed(2) ?? "-"} />
          <Stat label="Pressure" value={stat ? `${Math.round(stat.pressurePerformance * 100)}%` : "-"} />
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Map-specific performance</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {player.roleSnapshots.map((snapshot) => (
            <div key={snapshot.id} className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
              {snapshot.mapName}: rating {snapshot.rating.toFixed(2)}, ADR {snapshot.adr.toFixed(1)}, opening {Math.round(snapshot.openingDuelRate * 100)}%
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Player risk</h2>
        <p className="mt-2 text-sm text-lab-muted">
          {stat && stat.worstPlayerLiability > 0.25 ? "Есть liability risk." : stat && stat.starDependency > 0.6 ? "Star dependency высокая: просадка игрока может сильно ударить по команде." : "Профиль стабилен для MVP mock data."}
        </p>
      </section>

      <Link href={player.teamId ? `/team/${player.teamId}` : "/matches"} className="inline-flex text-sm text-lab-cyan">К команде</Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
