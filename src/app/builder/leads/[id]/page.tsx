import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Configurator from "@/components/Configurator";
import CustomerNotes from "@/components/CustomerNotes";
import JobPanel from "@/components/JobPanel";
import LeadOutcomeButtons from "@/components/LeadOutcomeButtons";
import SaveTemplateButton from "@/components/SaveTemplateButton";
import { builderOpenLead } from "@/lib/leadService";
import { deriveStatus, leadStatusLabel } from "@/lib/leadStatus";
import { requireBuilderTenant } from "@/lib/routeAuth";
import { loadProfiles } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const auth = await requireBuilderTenant();
  if (!auth.ok) redirect("/builder/login");
  const { ctx } = auth;

  // Opening a submitted lead auto-advances it to in_review (free "seen" signal).
  const lead = await builderOpenLead(ctx.scope, params.id);
  if (!lead) notFound();

  const design = await ctx.scope.getDesign(lead.designId);
  if (!design) notFound();
  const revision = await ctx.scope.getRevision(design.currentRevisionId);
  const revisions = await ctx.scope.listRevisions(lead.designId);
  const customer = await ctx.scope.getCustomer(lead.customerId);
  const profiles = await loadProfiles(ctx.scope);
  const derived = deriveStatus(lead.status, lead.lastActivityAt, ctx.meta.abandonedThresholdDays);
  const job = await ctx.scope.getJobByLead(lead.id);

  const fmtDate = (s: string) => new Date(s).toLocaleString("en-US");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{lead.customerContact.email}</h1>
          <p className="text-xs text-slate-500">
            {design.name} ·{" "}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{leadStatusLabel(derived, "builder")}</span>
            {customer?.consent?.optedIn ? " · ✅ opted in to contact" : " · ⚠️ no contact consent"}
          </p>
        </div>
        <Link href="/builder/leads" className="text-sm text-brand hover:underline">← all leads</Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <LeadOutcomeButtons leadId={lead.id} status={derived} />
        <SaveTemplateButton designId={design.id} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Audit trail (§5.5)</h3>
        <ol className="space-y-1 text-sm">
          {[...revisions].reverse().map((r) => (
            <li key={r.id} className="flex items-center justify-between border-b border-slate-100 py-1">
              <span>
                v{r.version} · <span className="text-slate-500">{r.changeSummary}</span>
                {lead.quotedRevisionId === r.id && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">quoted</span>}
                {r.version === 1 && <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">original submission</span>}
              </span>
              <span className="text-xs text-slate-400">
                {r.authorRole === "builder" ? "Builder" : "Customer"} · {fmtDate(r.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {job && <JobPanel jobId={job.id} status={job.status} notes={job.notes ?? ""} milestones={job.milestones} />}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Customer notes</h3>
        <CustomerNotes customerId={lead.customerId} initialNotes={customer?.notes ?? ""} />
      </section>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Revise &amp; re-quote (§5.5)</h3>
        {revision && (
          <Configurator
            designId={design.id}
            initialConfig={revision.config}
            initialVersion={revision.version}
            emailCaptured
            profiles={profiles}
            brandName={ctx.meta.branding.name}
            mode="builder"
            leadId={lead.id}
            threeDEnabled={ctx.meta.entitlements.fullThreeD}
            primaryColor={ctx.meta.branding.primaryColor}
          />
        )}
      </div>
    </div>
  );
}
