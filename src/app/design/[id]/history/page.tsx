import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RevisionList from "@/components/RevisionList";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";

export const dynamic = "force-dynamic";

export default function HistoryPage({ params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) redirect("/");
  const design = store.getDesign(params.id);
  if (!design) notFound();
  if (design.customerId !== session.customerId) redirect("/");

  const revisions = store.listRevisions(params.id).map((r) => ({
    version: r.version,
    changeSummary: r.changeSummary,
    authorRole: r.authorRole,
    createdAt: r.createdAt,
    total: r.estimateSnapshot?.total ?? null,
    currency: r.estimateSnapshot?.currency ?? "USD",
    isCurrent: r.id === design.currentRevisionId,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{design.name} — version history</h1>
        <p className="text-xs text-slate-500">
          Every save is an immutable snapshot. Restore or branch from any earlier version.{" "}
          <Link href={`/design/${design.id}`} className="text-brand hover:underline">← back to configurator</Link>
        </p>
      </div>
      <RevisionList designId={design.id} revisions={revisions} />
    </div>
  );
}
