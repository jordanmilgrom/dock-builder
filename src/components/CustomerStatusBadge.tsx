import { leadStatusLabel, type LeadStatus } from "@/lib/leadStatus";

/**
 * Customer-facing status pill. Uses ONLY customer vocabulary (§5.4): it routes
 * every label through leadStatusLabel(_, "customer"), so internal sales
 * terminology can never reach the customer.
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

export default function CustomerStatusBadge({ status }: { status: LeadStatus | null }) {
  if (!status) {
    return <span className="rounded px-1.5 py-0.5 text-xs bg-slate-100 text-slate-500">Draft</span>;
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${TONE[status]}`}>
      {leadStatusLabel(status, "customer")}
    </span>
  );
}
