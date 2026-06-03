import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RevisionList from "@/components/RevisionList";
import { getCustomerSession } from "@/lib/session";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const session = getCustomerSession(ctx.meta.id);
  if (!session) redirect("/");
  const design = await ctx.scope.getDesign(params.id);
  if (!design) notFound();
  if (design.customerId !== session.customerId) redirect("/");

  const revisions = (await ctx.scope.listRevisions(params.id)).map((r) => ({
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
      <RevisionList designId={design.id} revisions={revisions} audience="customer" />
    </div>
  );
}
