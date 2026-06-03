import { notFound } from "next/navigation";
import Configurator from "@/components/Configurator";
import EmbedResizer from "@/components/EmbedResizer";
import { getCustomerSession } from "@/lib/session";
import { getTenantContext, loadProfiles } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Embedded design editor — no header chrome (root layout drops it for /embed). */
export default async function EmbedDesignPage({ params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx || !ctx.meta.entitlements.embed) notFound();
  const session = getCustomerSession(ctx.meta.id);
  if (!session) notFound();
  const design = await ctx.scope.getDesign(params.id);
  if (!design || design.customerId !== session.customerId) notFound();
  const revision = await ctx.scope.getRevision(design.currentRevisionId);
  if (!revision) notFound();
  const customer = await ctx.scope.getCustomer(design.customerId);
  const profiles = await loadProfiles(ctx.scope);

  return (
    <div className="space-y-3">
      <EmbedResizer />
      <h1 className="text-base font-bold text-slate-900">{design.name}</h1>
      <Configurator
        designId={design.id}
        initialConfig={revision.config}
        initialVersion={revision.version}
        emailCaptured={Boolean(customer?.email)}
        profiles={profiles}
        brandName={ctx.meta.branding.name}
        alreadySubmitted={design.status === "submitted"}
      />
    </div>
  );
}
