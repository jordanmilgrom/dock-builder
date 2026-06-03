import type { SiteConditions } from "@/engine";
import QuestionnaireForm from "@/components/QuestionnaireForm";
import { getCustomerSession } from "@/lib/session";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await getTenantContext();
  let saved: SiteConditions | undefined;
  let templates: { id: string; name: string; dockType: string }[] = [];
  if (ctx) {
    const session = getCustomerSession(ctx.meta.id);
    if (session) saved = (await ctx.scope.getCustomer(session.customerId))?.savedShoreline;
    templates = (await ctx.scope.listTemplates()).map((t) => ({ id: t.id, name: t.name, dockType: t.config.dockType }));
    // Count a configurator view for analytics (§5.6).
    await ctx.scope.recordEvent("configurator_view", { surface: "hosted" });
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-900">Design your dock</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Answer a few questions about your shoreline. We&apos;ll recommend a dock type,
          seed a starting design, and give you a live planning-grade estimate as you
          build.
        </p>
      </section>
      <QuestionnaireForm defaultSite={saved ?? null} templates={templates} />
    </div>
  );
}
