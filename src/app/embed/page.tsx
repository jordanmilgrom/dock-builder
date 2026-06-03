import QuestionnaireForm from "@/components/QuestionnaireForm";
import EmbedResizer from "@/components/EmbedResizer";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Embedded configurator entry (§5.7). Stripped chrome (root layout drops it for
 *  /embed). Gated by entitlements.embed. */
export default async function EmbedHome() {
  const ctx = await getTenantContext();
  if (!ctx) {
    return <p className="text-sm text-slate-500">Configurator unavailable.</p>;
  }
  if (!ctx.meta.entitlements.embed) {
    return (
      <div className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        <EmbedResizer />
        This embedded configurator is a Pro feature.
      </div>
    );
  }

  await ctx.scope.recordEvent("configurator_view", { surface: "embed" });
  const templates = (await ctx.scope.listTemplates()).map((t) => ({ id: t.id, name: t.name, dockType: t.config.dockType }));

  return (
    <div className="space-y-3">
      <EmbedResizer />
      <h1 className="text-lg font-bold text-slate-900">Design your dock</h1>
      <QuestionnaireForm defaultSite={null} basePath="/embed/design" templates={templates} />
    </div>
  );
}
