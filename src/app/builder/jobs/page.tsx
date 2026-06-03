import Link from "next/link";
import { redirect } from "next/navigation";
import { BUILDER_JOB_TABS, jobStatusLabel } from "@/lib/jobs";
import { requireBuilderTenant } from "@/lib/routeAuth";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: { status?: string } }) {
  const auth = await requireBuilderTenant();
  if (!auth.ok) redirect("/builder/login");
  const { ctx } = auth;

  if (!ctx.meta.entitlements.jobTracking) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-slate-900">Jobs</h1>
        <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Job tracking is a Pro &amp; Premium feature. Accepted leads stay at “Accepted” on Starter.
        </p>
      </div>
    );
  }

  const jobs = await ctx.scope.listJobs();
  const active = (searchParams.status as JobStatus | "all") ?? "all";
  const rows = await Promise.all(
    jobs
      .filter((j) => active === "all" || j.status === active)
      .map(async (j) => {
        const lead = await ctx.scope.getLead(j.leadId);
        return { job: j, email: lead?.customerContact.email ?? "—" };
      }),
  );
  const counts = new Map<string, number>();
  for (const j of jobs) counts.set(j.status, (counts.get(j.status) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Jobs</h1>
        <Link href="/builder" className="text-sm text-brand hover:underline">← dashboard</Link>
      </div>

      <nav className="flex flex-wrap gap-1">
        {BUILDER_JOB_TABS.map((t) => {
          const count = t.key === "all" ? jobs.length : counts.get(t.key) ?? 0;
          return (
            <Link key={t.key} href={`/builder/jobs?status=${t.key}`}
              className={`rounded px-3 py-1 text-xs font-medium ${t.key === active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {t.label} ({count})
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No jobs in this view.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ job, email }) => (
            <li key={job.id} className="rounded border border-slate-200 bg-white p-3 text-sm">
              <Link href={`/builder/leads/${job.leadId}`} className="flex items-center justify-between">
                <span className="font-medium text-brand">{email}</span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{jobStatusLabel(job.status, "builder")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
