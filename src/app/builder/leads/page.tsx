import Link from "next/link";
import { redirect } from "next/navigation";
import { requireBuilderTenant } from "@/lib/routeAuth";
import { listLeadSummaries } from "@/lib/leadService";
import { BUILDER_FILTER_TABS, leadStatusLabel, type LeadStatus } from "@/lib/leadStatus";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function LeadsInboxPage({ searchParams }: { searchParams: { state?: string } }) {
  const auth = await requireBuilderTenant();
  if (!auth.ok) redirect("/builder/login");
  const { ctx } = auth;

  const all = await listLeadSummaries(ctx.scope, ctx.meta.abandonedThresholdDays);
  const active = (searchParams.state as LeadStatus | "all") ?? "abandoned";
  const rows = active === "all" ? all : all.filter((s) => s.derivedStatus === active);

  const now = Date.now();
  const abandonedThisWeek = all.filter(
    (s) => s.derivedStatus === "abandoned" && now - new Date(s.lead.lastActivityAt).getTime() <= WEEK_MS,
  ).length;

  const counts = new Map<string, number>();
  for (const s of all) counts.set(s.derivedStatus, (counts.get(s.derivedStatus) ?? 0) + 1);

  const money = (n: number | null, c: string) =>
    n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Leads</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-800">
            {abandonedThisWeek} abandoned this week
          </span>
          <Link href="/builder" className="text-brand hover:underline">← dashboard</Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1">
        {BUILDER_FILTER_TABS.map((t) => {
          const count = t.key === "all" ? all.length : counts.get(t.key) ?? 0;
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={`/builder/leads?state=${t.key}`}
              className={`rounded px-3 py-1 text-xs font-medium ${isActive ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t.label} ({count})
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No leads in this view.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.lead.id} className="rounded border border-slate-200 bg-white p-3 text-sm">
              <Link href={`/builder/leads/${s.lead.id}`} className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-brand">{s.customerEmail}</span>
                  <p className="text-xs text-slate-500">
                    {s.designName} · {s.dockType ?? "—"} · {money(s.total, s.currency)}
                  </p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {leadStatusLabel(s.derivedStatus, "builder")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
