import type { Metadata } from "next";
import { AppShell } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS2 Match Prediction Lab",
  description: "Research dashboard for explainable CS2 match prediction."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
