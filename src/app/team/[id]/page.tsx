import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPoolMatrix } from "@/components/MapPoolMatrix";
import { PlayerFormTable } from "@/components/PlayerFormTable";
import { prisma } from "@/lib/prisma";
import { buildPredictionInput } from "@/lib/predictionEngine";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      players: { where: { isActive: true }, orderBy: { nickname: "asc" } },
      teamFormSnapshots: { take: 1, orderBy: { createdAt: "desc" } },
      newsItems: { take: 5, orderBy: { publishedAt: "desc" } }
    }
  });
  if (!team) notFound();

  const nearest = await prisma.match.findFirst({
    where: { status: "upcoming", OR: [{ teamAId: id }, { teamBId: id }] },
    orderBy: { startTime: "asc" }
  });
  const input = nearest ? await buildPredictionInput(nearest.id) : null;
  const form = team.teamFormSnapshots[0];
  const stats = await prisma.playerStatSnapshot.findMany({ where: { teamId: id } });

  return (
    <div className="space-y-5">
      <section className="rounded border border-lab-border bg-lab-panel p-5">
        <p className="text-sm uppercase tracking-wide text-lab-cyan">{team.region}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{team.name}</h1>
        <p className="mt-2 text-sm text-lab-muted">Rank {team.valveRank ?? "-"} · Elo {team.internalElo.toFixed(0)} · {team.topRankCategory}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Stat label="Form" value={form ? `${Math.round(form.formScore * 100)}%` : "-"} />
          <Stat label="Closing" value={form ? `${Math.round(form.closeOutRate * 100)}%` : "-"} />
          <Stat label="Comeback" value={form ? `${Math.round(form.comebackFrom3RoundDeficit * 100)}%` : "-"} />
          <Stat label="Roster stability" value={form ? `${Math.round(form.rosterStabilityScore * 100)}%` : "-"} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold text-white">Состав</h2>
        <PlayerFormTable players={team.players} stats={stats} />
      </section>

      {input && (
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Map pool в ближайшем матче</h2>
          <MapPoolMatrix input={JSON.parse(JSON.stringify(input))} />
        </section>
      )}

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Новости</h2>
        <div className="mt-3 space-y-2 text-sm text-lab-muted">
          {team.newsItems.map((item) => <p key={item.id}>{item.title}: {item.summary}</p>)}
        </div>
      </section>

      <Link href="/matches" className="inline-flex text-sm text-lab-cyan">Назад к матчам</Link>
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
