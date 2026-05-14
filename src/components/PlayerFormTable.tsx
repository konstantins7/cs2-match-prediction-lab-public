import type { PlayerEntity, PlayerStatEntity } from "@/lib/prediction/types";

export function PlayerFormTable({ players, stats, emptyMessage }: { players: PlayerEntity[]; stats: PlayerStatEntity[]; emptyMessage?: string }) {
  const statByPlayer = new Map(stats.map((stat) => [stat.playerId, stat]));

  if (players.length === 0) {
    return (
      <div className="rounded border border-lab-border bg-lab-panel p-4">
        <p className="text-sm text-lab-amber">{emptyMessage ?? "Состав игроков не найден в бесплатных данных PandaScore или не сопоставлен."}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-lab-border bg-lab-panel">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-lab-panel2 text-xs uppercase text-lab-muted">
          <tr>
            <th className="px-3 py-3">Игрок</th>
            <th className="px-3 py-3">Role</th>
            <th className="px-3 py-3">K/D</th>
            <th className="px-3 py-3">Rating</th>
            <th className="px-3 py-3">ADR</th>
            <th className="px-3 py-3">KAST</th>
            <th className="px-3 py-3">Impact</th>
            <th className="px-3 py-3">Trend</th>
            <th className="px-3 py-3">Volatility</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-lab-border">
          {players.map((player) => {
            const stat = statByPlayer.get(player.id);
            return (
              <tr key={player.id} className="hover:bg-lab-panel2/60">
                <td className="px-3 py-3 font-medium text-white">{player.nickname}</td>
                <td className="px-3 py-3">{player.role}</td>
                <td className="px-3 py-3">{stat?.kd.toFixed(2) ?? "-"}</td>
                <td className="px-3 py-3">{stat?.rating.toFixed(2) ?? "-"}</td>
                <td className="px-3 py-3">{stat?.adr.toFixed(1) ?? "-"}</td>
                <td className="px-3 py-3">{stat ? `${Math.round(stat.kast * 100)}%` : "-"}</td>
                <td className="px-3 py-3">{stat?.impact.toFixed(2) ?? "-"}</td>
                <td className={(stat?.trendScore ?? 0) >= 0 ? "px-3 py-3 text-lab-green" : "px-3 py-3 text-lab-red"}>{stat?.trendScore.toFixed(2) ?? "-"}</td>
                <td className="px-3 py-3">{stat ? `${Math.round(stat.volatilityScore * 100)}%` : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
