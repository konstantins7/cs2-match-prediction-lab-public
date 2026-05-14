"use client";

import { useState } from "react";

export type RankMatchingCandidate = {
  teamId: string;
  teamName: string;
  normalizedTeamName: string;
  externalId: string;
  valveTeamName: string;
  normalizedValveName: string;
  rank: number;
  points: number;
  region: string | null;
  confidence: number;
};

export function RankMatchingPanel({ candidates }: { candidates: RankMatchingCandidate[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("Confirm создаёт EntityAlias + TeamRankSnapshot. Reject запрещает automatic rematch для этой пары.");

  async function run(action: "rank_match_confirm" | "rank_match_reject", candidate: RankMatchingCandidate) {
    setBusy(`${action}:${candidate.teamId}:${candidate.externalId}`);
    setMessage("Saving rank matching decision...");
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          payload: JSON.stringify({ teamId: candidate.teamId, externalId: candidate.externalId })
        })
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      setMessage(json.ok ? "Rank matching decision saved. Обновите страницу, чтобы увидеть новые rank snapshots." : json.error ?? "Rank matching failed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rank matching failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h2 className="font-semibold text-white">Rank Matching</h2>
      <p className="mt-1 text-sm text-lab-muted">{message}</p>
      {candidates.length === 0 ? (
        <p className="mt-3 text-sm text-lab-muted">Нет unranked real teams с уверенными Valve Ranking кандидатами.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-lab-muted">
              <tr>
                <th className="py-2">Unranked team</th>
                <th>Normalized</th>
                <th>Valve candidate</th>
                <th>Rank</th>
                <th>Confidence</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-lab-border">
              {candidates.map((candidate) => {
                const id = `${candidate.teamId}:${candidate.externalId}`;
                return (
                  <tr key={id}>
                    <td className="py-2 text-white">{candidate.teamName}</td>
                    <td className="text-lab-muted">{candidate.normalizedTeamName} → {candidate.normalizedValveName}</td>
                    <td>{candidate.valveTeamName}</td>
                    <td>{candidate.rank}</td>
                    <td>{Math.round(candidate.confidence * 100)}%</td>
                    <td className="flex gap-2 py-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => run("rank_match_confirm", candidate)}
                        className="rounded bg-lab-cyan px-2 py-1 text-xs font-medium text-black disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => run("rank_match_reject", candidate)}
                        className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
