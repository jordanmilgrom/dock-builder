import Link from "next/link";
import CustomerStatusBadge from "@/components/CustomerStatusBadge";
import { deriveStatus } from "@/lib/leadStatus";
import { getCustomerSession } from "@/lib/session";
import { getTenantContext } from "@/lib/tenant";
import { DRAFT_CAP } from "@/lib/versioning";

export const dynamic = "force-dynamic";

export default async function DesignsPage() {
  const ctx = await getTenantContext();
  const session = ctx ? getCustomerSession(ctx.meta.id) : null;
  const designs = ctx && session ? await ctx.scope.listDesignsByCustomer(session.customerId) : [];
  const drafts = designs.filter((d) => d.status === "draft").length;
  const threshold = ctx?.meta.abandonedThresholdDays ?? 3;

  const rows = await Promise.all(
    designs.map(async (d) => {
      const rev = ctx ? await ctx.scope.getRevision(d.currentRevisionId) : undefined;
      const lead = ctx ? await ctx.scope.findLeadByDesign(d.id) : undefined;
      const status = lead ? deriveStatus(lead.status, lead.lastActivityAt, threshold) : null;
      // Accepted leads with a Job (Pro+) show the customer-facing job phase.
      const job = ctx && lead && status === "accepted" ? await ctx.scope.getJobByLead(lead.id) : undefined;
      return { design: d, rev, status, jobStatus: job?.status ?? null };
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My designs</h1>
        <Link href="/" className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
          + New design
        </Link>
      </div>
      <p className="text-xs text-slate-500">{drafts} / {DRAFT_CAP} drafts used</p>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No designs yet. Start one from the questionnaire.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ design: d, rev, status, jobStatus }) => (
            <li key={d.id} className="flex items-center justify-between rounded border border-slate-200 bg-white p-3 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <Link href={`/design/${d.id}`} className="font-medium text-brand hover:underline">{d.name}</Link>
                  <CustomerStatusBadge status={status} jobStatus={jobStatus} />
                </div>
                <p className="text-xs text-slate-500">
                  {rev?.config.dockType} · v{rev?.version ?? 0} · updated {new Date(d.updatedAt).toLocaleDateString("en-US")}
                </p>
              </div>
              <Link href={`/design/${d.id}/history`} className="text-xs text-slate-500 hover:underline">history</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
