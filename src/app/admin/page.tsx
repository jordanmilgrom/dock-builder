import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Platform admin (§8 Phase 2 item 7): tenant list, subscription status, basic
 *  abuse signals. No CRM features (Phase 3). */
export default async function AdminPage() {
  const admin = requirePlatformAdmin();
  if (!admin) redirect("/admin/login");

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true, designs: true, customers: true } } },
  });

  const fmtDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-US") : "—");

  function signals(t: (typeof tenants)[number]): { label: string; tone: string }[] {
    const out: { label: string; tone: string }[] = [];
    if (t.subscriptionStatus === "past_due") out.push({ label: "past due", tone: "bg-amber-100 text-amber-800" });
    if (t.subscriptionStatus === "canceled") out.push({ label: "canceled", tone: "bg-red-100 text-red-800" });
    if (t.leadCap !== null && t._count.leads >= t.leadCap) out.push({ label: "lead cap reached", tone: "bg-red-100 text-red-800" });
    else if (t.leadCap !== null && t._count.leads >= t.leadCap * 0.8) out.push({ label: "near lead cap", tone: "bg-amber-100 text-amber-800" });
    if (t.subscriptionStatus === "trialing" && t._count.designs === 0) out.push({ label: "trial, no activity", tone: "bg-slate-100 text-slate-600" });
    return out;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Platform admin</h1>
        <span className="text-xs text-slate-500">{tenants.length} tenants</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Designs</th>
              <th className="px-3 py-2">Trial ends</th>
              <th className="px-3 py-2">Signals</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">{t.name}</div>
                  <div className="text-xs text-slate-400">{t.slug}.app.com</div>
                </td>
                <td className="px-3 py-2 uppercase">{t.tier}</td>
                <td className="px-3 py-2 capitalize">{t.subscriptionStatus.replace("_", " ")}</td>
                <td className="px-3 py-2 text-right">
                  {t._count.leads}{t.leadCap === null ? "" : ` / ${t.leadCap}`}
                </td>
                <td className="px-3 py-2 text-right">{t._count.designs}</td>
                <td className="px-3 py-2">{fmtDate(t.trialEndsAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {signals(t).map((s) => (
                      <span key={s.label} className={`rounded px-1.5 py-0.5 text-xs ${s.tone}`}>{s.label}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
