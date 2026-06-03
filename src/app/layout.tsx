import type { Metadata } from "next";
import Link from "next/link";
import { DISCLAIMER } from "@/lib/seed";
import { getTenantContext } from "@/lib/tenant";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getTenantContext();
  const name = ctx?.meta.branding.name ?? "Dock Configurator";
  return {
    title: `${name} — Dock Configurator`,
    description: "Design your dock, get an instant planning-grade estimate.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();
  const b = ctx?.meta.branding;
  const secondary = b?.secondaryColor ?? "#0f172a";
  const logoText = b?.logoText ?? "DOCK CONFIGURATOR";
  // Badge shows unless the tenant both is entitled to remove it AND has toggled it off.
  const showBadge = !(ctx?.meta.entitlements.removeBadge && b?.removeBadge);

  return (
    <html lang="en">
      <body>
        <header style={{ backgroundColor: secondary }} className="text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-wide">
              {logoText}
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
          {showBadge && <span className="ml-2 text-slate-400">· Powered by Dock Configurator</span>}
        </footer>
      </body>
    </html>
  );
}
