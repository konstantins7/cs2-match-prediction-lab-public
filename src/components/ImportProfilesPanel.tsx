import { getImportProfiles, type ImportProfile } from "@/lib/importProfiles";

export function ImportProfilesPanel({ compact = false }: { compact?: boolean }) {
  const profiles = getImportProfiles();
  return (
    <section id="import-profiles" className={compact ? "rounded border border-lab-border bg-lab-panel p-4" : "rounded-2xl border border-lab-border bg-lab-panel p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Import profiles</h2>
          <p className="mt-1 text-sm text-lab-muted">
            0.7.4 принимает prepared JSON через dedicated parsed demo export intake и существующие validated `manual_real` / `parsed_demo` flows. XLSX, SQL и raw .dem parser worker помечены как future/inactive.
          </p>
        </div>
        <span className="rounded-full border border-lab-amber/35 bg-lab-amber/10 px-3 py-1 text-xs font-medium text-lab-amber">без новых парсеров</span>
      </div>
      <div className={compact ? "mt-4 grid gap-3 lg:grid-cols-2" : "mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3"}>
        {profiles.map((profile) => (
          <ImportProfileCard key={profile.id} profile={profile} compact={compact} />
        ))}
      </div>
    </section>
  );
}

export function DemoStatExportCta() {
  const profiles = getImportProfiles().filter((profile) => ["parsed_demo_json", "cs_demo_manager_json", "awpy_json", "demoparser_json"].includes(profile.id));
  return (
    <section className="rounded-2xl border border-lab-green/35 bg-lab-panel/85 p-4">
      <h2 className="font-semibold text-white">Самый сильный бесплатный путь: загрузить demo/stat export</h2>
      <p className="mt-1 text-sm text-lab-muted">
        Выберите JSON-first профиль и загрузите нормализованный результат в panel `Загрузить demo/stat export`. XLSX/SQL/raw .dem parser worker пока не включены.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {profiles.map((profile) => (
          <article key={profile.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase text-lab-cyan">{statusLabel(profile.status)}</p>
            <h3 className="mt-1 font-semibold text-white">{profile.title}</h3>
            <p className="mt-2 text-sm text-lab-muted">{profile.expectedImpact}</p>
            <a href={profile.actionHref} className="mt-3 inline-flex rounded border border-lab-cyan/45 px-3 py-1.5 text-sm text-lab-cyan hover:bg-lab-cyan/10">
              Открыть профиль
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

function ImportProfileCard({ profile, compact }: { profile: ImportProfile; compact: boolean }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-white">{profile.title}</h3>
        <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{statusLabel(profile.status)}</span>
      </div>
      <p className="mt-2 text-sm text-lab-muted">{profile.expectedFormat}</p>
      <dl className="mt-3 space-y-2 text-xs text-lab-muted">
        <div>
          <dt className="uppercase">Expected JSON schema</dt>
          <dd className="mt-1 rounded bg-lab-panel2 p-2 font-mono text-[11px] text-white">{profile.expectedJsonSchema}</dd>
        </div>
        <div>
          <dt className="uppercase">Required fields</dt>
          <dd className="text-white">{profile.requiredFields.join(", ")}</dd>
        </div>
        {!compact ? (
          <>
            <div>
              <dt className="uppercase">Optional fields</dt>
              <dd className="text-white">{profile.optionalFields.join(", ") || "нет"}</dd>
            </div>
            <div>
              <dt className="uppercase">Source metadata</dt>
              <dd className="text-white">{profile.sourceMetadata.join(", ")}</dd>
            </div>
            <div>
              <dt className="uppercase">Data role</dt>
              <dd className="text-white">{profile.dataRole}</dd>
            </div>
            <div>
              <dt className="uppercase">Cutoff/leakage rules</dt>
              <dd className="text-white">{profile.cutoffLeakageRules.join(" · ")}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt className="uppercase">Validation checklist</dt>
          <dd className="text-white">{profile.validationChecklist.join(" · ")}</dd>
        </div>
        <div>
          <dt className="uppercase">Mapping hints</dt>
          <dd className="text-white">{profile.mappingHints.join(" · ")}</dd>
        </div>
        {profile.futureParsers?.length ? (
          <div>
            <dt className="uppercase">Future/inactive parsers</dt>
            <dd className="text-lab-amber">{profile.futureParsers.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      <a href={profile.actionHref} className="mt-3 inline-flex rounded-lg border border-lab-cyan/45 bg-lab-cyan/10 px-3 py-2 text-sm font-medium text-lab-cyan hover:bg-lab-cyan/15">
        Перейти к действию
      </a>
    </article>
  );
}

function statusLabel(status: ImportProfile["status"]) {
  const labels: Record<ImportProfile["status"], string> = {
    active: "активный JSON flow",
    instruction_only: "instruction profile",
    placeholder: "placeholder",
    future_inactive: "future/inactive"
  };
  return labels[status];
}
