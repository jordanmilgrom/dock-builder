import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ConfiguratorPane from "@/components/ConfiguratorPane";
import { getCustomerSession } from "@/lib/session";
import { getTenantContext, loadProfiles } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function DesignPage({ params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const session = getCustomerSession(ctx.meta.id);
  if (!session) redirect("/");
  const design = await ctx.scope.getDesign(params.id);
  if (!design) notFound();
  if (design.customerId !== session.customerId) redirect("/");
  const revision = await ctx.scope.getRevision(design.currentRevisionId);
  if (!revision) notFound();
  const customer = await ctx.scope.getCustomer(design.customerId);
  const profiles = await loadProfiles(ctx.scope);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{design.name}</h1>
          <p className="text-xs text-slate-500">
            Draft · v{revision.version} ·{" "}
            <Link href={`/design/${design.id}/history`} className="text-brand hover:underline">
              version history
            </Link>
          </p>
        </div>
        <Link href="/designs" className="text-sm text-brand hover:underline">My designs →</Link>
      </div>
      <Suspense fallback={<div className="h-[32rem] rounded-lg border border-slate-200 bg-white" />}>
        <ConfiguratorPane
          designId={design.id}
          initialConfig={revision.config}
          initialVersion={revision.version}
          emailCaptured={Boolean(customer?.email)}
          profiles={profiles}
          brandName={ctx.meta.branding.name}
          alreadySubmitted={design.status === "submitted"}
          threeDEnabled={ctx.meta.entitlements.fullThreeD}
          primaryColor={ctx.meta.branding.primaryColor}
        />
      </Suspense>
    </div>
  );
}
