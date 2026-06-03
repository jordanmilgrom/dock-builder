import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { DISCLAIMER } from "@/lib/seed";
import { getRequestResolution } from "@/lib/tenant";
import { PATHNAME_HEADER } from "@/lib/tenantRouting";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const r = await getRequestResolution();
  const name = r.kind === "tenant" ? r.ctx.meta.branding.name : "Dock Configurator";
  return {
    title: `${name} — Dock Configurator`,
    description: "Design your dock, get an instant planning-grade estimate.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const resolution = await getRequestResolution();
  const pathname = headers().get(PATHNAME_HEADER) ?? "";
  const isEmbed = pathname.startsWith("/embed");

  // Custom domain pointed at us but not verified yet (§5.7): friendly placeholder.
  if (resolution.kind === "unverified_domain") {
    return (
      <html lang="en">
        <body>
          <div className="mx-auto max-w-lg px-4 py-24 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Domain not verified yet</h1>
            <p className="mt-3 text-sm text-slate-600">
              This domain for <span className="font-semibold">{resolution.name}</span> is being set up.
              If you’re the builder, finish DNS verification in your dashboard.
            </p>
          </div>
        </body>
      </html>
    );
  }

  const ctx = resolution.kind === "tenant" ? resolution.ctx : null;
  const b = ctx?.meta.branding;

  // Embed iframe: render the configurator with NO header/footer chrome so it
  // fits cleanly inside the builder's own page.
  if (isEmbed) {
    return (
      <html lang="en">
        <body>
          <div className="px-3 py-3">{children}</div>
        </body>
      </html>
    );
  }

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
