import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS2 Match Prediction Lab",
  description: "Research dashboard for explainable CS2 match prediction."
};

const nav = [
  ["/", "Матчи"],
  ["/predictions", "Прогнозы"],
  ["/admin/model", "Модель"],
  ["/admin/backtesting", "Backtesting"],
  ["/admin/data-quality", "Качество данных"],
  ["/admin/sources", "Источники"]
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
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
