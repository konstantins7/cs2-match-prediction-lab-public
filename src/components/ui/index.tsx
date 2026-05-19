import Link from "next/link";
import React, { type ReactNode } from "react";
import { Activity, BarChart3, ChevronRight, Database, Gauge, Layers3, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { DataDepth, ForecastStoryView, ConfidenceRiskView } from "@/lib/ui/forecastUx";
import { readinessRu } from "@/lib/russianLabels";
import type { PredictionReadinessLevel, RiskLevel } from "@/lib/predictionEngine";

type Tone = "cyan" | "violet" | "blue" | "green" | "amber" | "red" | "purple" | "muted";

const toneClass: Record<Tone, string> = {
  cyan: "border-lab-cyan/45 bg-lab-cyan/10 text-lab-cyan shadow-[0_0_28px_rgba(56,189,248,0.08)]",
  violet: "border-violet-400/45 bg-violet-500/10 text-violet-300 shadow-[0_0_28px_rgba(167,139,250,0.08)]",
  blue: "border-blue-400/45 bg-blue-500/10 text-blue-300 shadow-[0_0_28px_rgba(59,130,246,0.08)]",
  green: "border-lab-green/45 bg-lab-green/10 text-lab-green shadow-[0_0_28px_rgba(34,197,94,0.08)]",
  amber: "border-lab-amber/45 bg-lab-amber/10 text-lab-amber shadow-[0_0_28px_rgba(245,158,11,0.08)]",
  red: "border-lab-red/45 bg-lab-red/10 text-lab-red shadow-[0_0_28px_rgba(239,68,68,0.08)]",
  purple: "border-purple-400/45 bg-purple-500/10 text-purple-300 shadow-[0_0_28px_rgba(192,132,252,0.08)]",
  muted: "border-lab-border bg-lab-panel2 text-lab-muted"
};

export function AppShell({ children }: { children: ReactNode }) {
  const userNav = [
    ["/matches", "Матчи"],
    ["/predictions", "Прогнозы"],
    ["/admin/research-queue", "Задачи"],
    ["/admin/sources", "Источники"],
    ["/admin/model", "Модель"]
  ];
  const analystNav = [
    ["/admin/research-queue", "Data pack"],
    ["/admin/sources#source-coverage", "Source coverage"],
    ["/admin/model-lab#feature-snapshot", "Feature snapshot"],
    ["/match/pandascore_match_1474573", "News/Risk"],
    ["/admin/model-lab#calibration", "Calibration"]
  ];
  const advancedNav = [
    ["/admin/backtesting", "Backtesting"],
    ["/admin/benchmarks", "Benchmarks"],
    ["/admin/data-quality", "Data Quality"],
    ["/admin/imports", "Raw diagnostics"],
    ["/api/admin/model-lab/training-dataset", "Training export"],
    ["/admin/sources#source-jobs", "Source jobs"]
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_top_right,rgba(167,139,250,0.10),transparent_28%),#070a0f] text-lab-text">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-lab-cyan/45 bg-lab-cyan/10 text-lab-cyan shadow-[0_0_30px_rgba(56,189,248,0.18)]">
              <Activity size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold uppercase tracking-[0.2em] text-white">CS2 Lab</span>
              <span className="block text-xs text-lab-muted">Forecast command center</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {userNav.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-lab-muted transition hover:border-lab-cyan/70 hover:text-white">
                {label}
              </Link>
            ))}
            <details className="relative">
              <summary className="cursor-pointer rounded-lg border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-violet-200 transition hover:border-violet-300/70">
                Режим аналитика
              </summary>
              <div className="absolute right-0 z-40 mt-2 grid min-w-56 gap-1 rounded-xl border border-white/10 bg-[#101620] p-2 shadow-2xl">
                {analystNav.map(([href, label]) => (
                  <Link key={`${href}-${label}`} href={href} className="rounded-lg px-3 py-2 text-lab-muted hover:bg-white/5 hover:text-white">
                    {label}
                  </Link>
                ))}
              </div>
            </details>
            <details className="relative">
              <summary className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-lab-muted transition hover:border-lab-cyan/70 hover:text-white">
                Расширенно
              </summary>
              <div className="absolute right-0 z-40 mt-2 grid min-w-56 gap-1 rounded-xl border border-white/10 bg-[#101620] p-2 shadow-2xl">
                {advancedNav.map(([href, label]) => (
                  <Link key={`${href}-${label}`} href={href} className="rounded-lg px-3 py-2 text-lab-muted hover:bg-white/5 hover:text-white">
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-lab-panel/80 p-5 shadow-[0_0_40px_rgba(8,13,22,0.45)]">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lab-cyan">{eyebrow}</p> : null}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-lab-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

export function StatCard({ label, value, detail, tone = "cyan", icon }: { label: string; value: number | string; detail?: string; tone?: Tone; icon?: ReactNode }) {
  return (
    <article className={`rounded-2xl border bg-lab-panel/80 p-4 ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
        </div>
        {icon ? <span className="rounded-xl border border-current/30 p-2 opacity-80">{icon}</span> : null}
      </div>
      {detail ? <p className="mt-3 text-sm text-lab-muted">{detail}</p> : null}
    </article>
  );
}

export function StatusPill({ label, tone = "muted" }: { label: string; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass[tone]}`}>{label}</span>;
}

export function ActionButton({ href, children, tone = "cyan" }: { href: string; children: ReactNode; tone?: "cyan" | "violet" | "green" | "ghost" }) {
  const cls =
    tone === "ghost"
      ? "border border-white/10 bg-white/[0.03] text-lab-cyan hover:border-lab-cyan/70"
      : tone === "green"
        ? "border border-lab-green/50 bg-lab-green px-4 py-2 text-black hover:bg-green-300"
        : tone === "violet"
          ? "border border-violet-400/50 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30"
          : "border border-lab-cyan/50 bg-lab-cyan px-4 py-2 text-black hover:bg-cyan-300";
  return <Link href={href} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${cls}`}>{children}</Link>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-lab-panel/80 p-6 text-center">
      <Sparkles className="mx-auto text-lab-cyan" size={22} />
      <h3 className="mt-3 font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-lab-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

export function InfoBanner({ title, children, tone = "cyan" }: { title: string; children: ReactNode; tone?: Tone }) {
  return (
    <section className={`rounded-2xl border p-4 ${toneClass[tone]}`}>
      <h2 className="font-semibold text-white">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-lab-muted">{children}</div>
    </section>
  );
}

export function ProgressSteps({ steps, activeIndex = steps.length - 1 }: { steps: readonly string[]; activeIndex?: number }) {
  return (
    <ol className="grid gap-2 text-sm md:grid-cols-2">
      {steps.map((step, index) => (
        <li key={step} className={index <= activeIndex ? "rounded-lg border border-lab-cyan/35 bg-lab-cyan/10 px-3 py-2 text-lab-cyan" : "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-lab-muted"}>
          {index + 1}. {step}
        </li>
      ))}
    </ol>
  );
}

export function SourceStatusCard({ title, status, gives, configured, unavailable, action, limitations }: { title: string; status: string; gives: string; configured: string; unavailable: string; action: string; limitations: string }) {
  const tone = status.includes("подключ") || status.includes("доступ") ? "green" : status.includes("future") || status.includes("буду") ? "violet" : "amber";
  return (
    <article className="rounded-2xl border border-white/10 bg-lab-panel/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-white">{title}</h3>
        <StatusPill label={status} tone={tone as Tone} />
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div><dt className="text-lab-muted">Что даст</dt><dd className="text-white">{gives}</dd></div>
        <div><dt className="text-lab-muted">Что подключено</dt><dd className="text-white">{configured}</dd></div>
        <div><dt className="text-lab-muted">Что недоступно</dt><dd className="text-white">{unavailable}</dd></div>
        <div><dt className="text-lab-muted">Что сделать</dt><dd className="text-lab-cyan">{action}</dd></div>
        <div><dt className="text-lab-muted">Ограничения</dt><dd className="text-lab-muted">{limitations}</dd></div>
      </dl>
    </article>
  );
}

export function DataDepthMeter({ depth, title = "Глубина данных" }: { depth: DataDepth; title?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lab-muted">{title}</p>
        <span className="text-sm font-semibold text-white">{depth.level}/5</span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <span key={level} className={level <= depth.level ? "h-2 rounded bg-lab-cyan shadow-[0_0_14px_rgba(56,189,248,0.28)]" : "h-2 rounded bg-white/10"} />
        ))}
      </div>
      <p className="mt-2 text-sm font-medium text-white">{depth.label}</p>
      <p className="mt-1 text-xs text-lab-muted">{depth.description}</p>
    </div>
  );
}

export function MatchHero({ eventName, teamAName, teamBName, meta, status }: { eventName: string; teamAName: string; teamBName: string; meta: string; status: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-lab-cyan/30 bg-[linear-gradient(135deg,rgba(14,21,32,0.96),rgba(10,12,18,0.98))] p-5 shadow-[0_0_48px_rgba(56,189,248,0.10)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lab-cyan">{eventName}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{teamAName} <span className="text-lab-muted">vs</span> {teamBName}</h1>
          <p className="mt-2 text-sm text-lab-muted">{meta}</p>
        </div>
        <StatusPill label={status} tone="blue" />
      </div>
    </section>
  );
}

export function ForecastStatusHero({
  readiness,
  realReady,
  confidence,
  risk,
  depth,
  primaryAction,
  actions
}: {
  readiness: PredictionReadinessLevel;
  realReady: boolean;
  confidence: number;
  risk: RiskLevel;
  depth: DataDepth;
  primaryAction: ReactNode;
  actions: ReactNode;
}) {
  const riskTone: Tone = risk === "High" ? "red" : risk === "Medium" ? "amber" : "green";
  return (
    <section className="rounded-2xl border border-white/10 bg-lab-panel/85 p-5">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lab-cyan">Статус прогноза</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{readinessRu[readiness]}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill label={realReady ? "Реальный прогноз готов" : "Прогноз не готов"} tone={realReady ? "green" : "amber"} />
            <StatusPill label={`Уверенность ${confidence}/100`} tone={confidence >= 70 ? "green" : confidence >= 55 ? "amber" : "red"} />
            <StatusPill label={`Risk ${risk}`} tone={riskTone} />
          </div>
          <div className="mt-4">{primaryAction}</div>
          <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
        </div>
        <DataDepthMeter depth={depth} />
      </div>
    </section>
  );
}

export function NextBestActionCard({ label, reason, href }: { label: string; reason: string; href: string }) {
  return (
    <article className="rounded-2xl border border-lab-cyan/35 bg-lab-cyan/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lab-cyan">Лучшее следующее действие</p>
      <Link href={href} className="mt-2 inline-flex items-center gap-2 text-lg font-semibold text-white hover:text-lab-cyan">
        {label} <ChevronRight size={18} />
      </Link>
      <p className="mt-2 text-sm text-lab-muted">{reason}</p>
    </article>
  );
}

export function ForecastStory({ story }: { story: ForecastStoryView }) {
  const sections = [
    ["Что известно", story.known, <Database key="known" size={18} />],
    ["Чего не хватает", story.missing, <Layers3 key="missing" size={18} />],
    ["Почему вероятность такая", story.probability, <BarChart3 key="probability" size={18} />],
    ["Что может изменить прогноз", story.change, <Zap key="change" size={18} />],
    ["Лучшее следующее действие", [`${story.nextAction.label}: ${story.nextAction.reason}`], <ShieldCheck key="action" size={18} />]
  ] as const;
  return (
    <section className="rounded-2xl border border-white/10 bg-lab-panel/85 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lab-cyan">Почему статус такой?</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sections.map(([title, items, icon]) => (
          <article key={title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-white">{icon}<h3 className="font-semibold">{title}</h3></div>
            <ul className="mt-3 space-y-2 text-sm text-lab-muted">
              {items.slice(0, 4).map((item) => <li key={`${title}-${item}`}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ConfidenceRiskExplainer({ view }: { view: ConfidenceRiskView }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-lab-panel/85 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lab-cyan">Confidence / Risk</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <ExplainPanel title={view.confidenceLabel} items={view.confidenceReasons} tone="cyan" icon={<Gauge size={18} />} />
        <ExplainPanel title="Почему risk высокий" items={view.riskReasons} tone="red" icon={<Activity size={18} />} />
        <ExplainPanel title="Что снизит risk" items={view.reduceRiskWith} tone="green" icon={<ShieldCheck size={18} />} />
      </div>
    </section>
  );
}

function ExplainPanel({ title, items, tone, icon }: { title: string; items: string[]; tone: Tone; icon: ReactNode }) {
  return (
    <article className={`rounded-xl border p-4 ${toneClass[tone]}`}>
      <div className="flex items-center gap-2 text-white">{icon}<h3 className="font-semibold">{title}</h3></div>
      <ul className="mt-3 space-y-2 text-sm text-lab-muted">
        {items.slice(0, 4).map((item) => <li key={`${title}-${item}`}>{item}</li>)}
      </ul>
    </article>
  );
}
