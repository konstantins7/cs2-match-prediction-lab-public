import Link from "next/link";
import { MatchTable } from "@/components/MatchTable";
import { getCalculatedMatches } from "@/lib/data/matches";

type Search = {
  status?: string;
  format?: string;
  top?: string;
  confidence?: string;
};

function filterLink(label: string, href: string) {
  return (
    <Link href={href} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan hover:text-white">
      {label}
    </Link>
  );
}

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const rows = await getCalculatedMatches({
    status: params.status,
    format: params.format,
    top: params.top ? Number(params.top) : undefined,
    highConfidence: params.confidence === "high"
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Матчи</h1>
        <p className="mt-1 text-sm text-lab-muted">Фильтры пересчитывают прогнозы из текущих Prisma/mock данных.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {filterLink("Все", "/matches")}
        {filterLink("Upcoming", "/matches?status=upcoming")}
        {filterLink("Live", "/matches?status=live")}
        {filterLink("Finished", "/matches?status=finished")}
        {filterLink("BO3", "/matches?format=BO3")}
        {filterLink("Top-20", "/matches?top=20")}
        {filterLink("Top-100", "/matches?top=100")}
        {filterLink("High confidence", "/matches?confidence=high")}
      </div>
      <MatchTable rows={rows} />
    </div>
  );
}
