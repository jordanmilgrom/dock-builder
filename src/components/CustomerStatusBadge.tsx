import { leadStatusLabel, type LeadStatus } from "@/lib/leadStatus";
import { jobStatusLabel } from "@/lib/jobs";
import type { JobStatus } from "@/lib/types";

/**
 * Customer-facing status pill. Uses ONLY customer vocabulary (§5.4): every label
 * routes through leadStatusLabel/jobStatusLabel with audience "customer", so
 * internal sales terminology can never reach the customer. When a Job exists
 * (accepted lead, Pro+), the job phase replaces the lead status.
 */
const TONE: Record<LeadStatus, string> = {
  started: "bg-slate-100 text-slate-600",
  abandoned: "bg-slate-100 text-slate-600",
  submitted: "bg-sky-100 text-sky-700",
  in_review: "bg-amber-100 text-amber-700",
  quoted: "bg-emerald-100 text-emerald-700",
  accepted: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-600",
};

export default function CustomerStatusBadge({
  status,
  jobStatus,
}: {
  status: LeadStatus | null;
  jobStatus?: JobStatus | null;
}) {
  if (jobStatus) {
    return (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">
        {jobStatusLabel(jobStatus, "customer")}
      </span>
    );
  }
  if (!status) {
    return <span className="rounded px-1.5 py-0.5 text-xs bg-slate-100 text-slate-500">Draft</span>;
  }
  // A "started" (captured but unsubmitted) lead has no customer-facing label
  // (§5.4) — render nothing rather than an empty pill.
  const label = leadStatusLabel(status, "customer");
  if (!label) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${TONE[status]}`}>
      {label}
    </span>
  );
}
