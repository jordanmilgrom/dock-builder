import type { Metadata } from "next";
import Link from "next/link";
import { devBranding, DISCLAIMER } from "@/lib/seed";
import "./globals.css";

export const metadata: Metadata = {
  title: `${devBranding.name} — Dock Configurator`,
  description: "Design your dock, get an instant planning-grade estimate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ backgroundColor: devBranding.secondaryColor }} className="text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-wide">
              {devBranding.logoText}
            </Link>
            <nav className="flex gap-4 text-sm text-slate-200">
              <Link href="/" className="hover:text-white">New design</Link>
              <Link href="/designs" className="hover:text-white">My designs</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-slate-500">
          {DISCLAIMER}
          {!devBranding.removeBadge && (
            <span className="ml-2 text-slate-400">· Powered by Dock Configurator</span>
          )}
        </footer>
      </body>
    </html>
  );
}
