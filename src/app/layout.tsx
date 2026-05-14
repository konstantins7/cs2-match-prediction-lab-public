import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS2 Match Prediction Lab",
  description: "Research dashboard for explainable CS2 match prediction."
};

const nav = [
  ["/matches", "Матчи"],
  ["/predictions", "Прогнозы"],
  ["/admin/research-queue", "Задачи"],
  ["/admin/sources", "Источники"],
  ["/admin/model", "Модель"]
];

const advancedNav = [
  ["/admin/backtesting", "Backtesting"],
  ["/admin/data-quality", "Качество данных"],
  ["/admin/model-lab", "Лаборатория модели"],
  ["/admin/imports", "Сырые источники"],
  ["/api/admin/model-lab/training-dataset", "Датасет для обучения"],
  ["/admin/model-lab", "Утечка данных"]
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <div className="min-h-screen bg-lab-bg text-lab-text">
          <header className="border-b border-lab-border bg-lab-panel/80">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
              <Link href="/" className="font-semibold tracking-wide text-white">
                CS2 Match Prediction Lab
              </Link>
              <nav className="flex flex-wrap gap-2 text-sm text-lab-muted">
                {nav.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded border border-lab-border px-3 py-1.5 hover:border-lab-cyan hover:text-white"
                  >
                    {label}
                  </Link>
                ))}
                <details className="relative">
                  <summary className="cursor-pointer rounded border border-lab-border px-3 py-1.5 hover:border-lab-cyan hover:text-white">
                    Расширенно
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 grid min-w-48 gap-1 rounded border border-lab-border bg-lab-panel p-2 shadow-xl">
                    {advancedNav.map(([href, label]) => (
                      <Link key={`${href}-${label}`} href={href} className="rounded px-3 py-1.5 hover:bg-lab-panel2 hover:text-white">
                        {label}
                      </Link>
                    ))}
                  </div>
                </details>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
