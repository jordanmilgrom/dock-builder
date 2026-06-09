import type { SiteConditions } from "@/engine";
import CanvasLanding from "@/components/CanvasLanding";
import { getCustomerSession } from "@/lib/session";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await getTenantContext();
  let saved: SiteConditions | undefined;
  let templates: { id: string; name: string; dockType: string }[] = [];
  let isReturning = false;
  let skipWizardByDefault = false;
  if (ctx) {
    skipWizardByDefault = ctx.meta.skipWizardByDefault;
    const session = getCustomerSession(ctx.meta.id);
    if (session) {
      const customer = await ctx.scope.getCustomer(session.customerId);
      saved = customer?.savedShoreline;
      isReturning = (await ctx.scope.listDesignsByCustomer(session.customerId)).length > 0;
    }
    templates = (await ctx.scope.listTemplates()).map((t) => ({ id: t.id, name: t.name, dockType: t.config.dockType }));
    // Count a configurator view for analytics (§5.6).
    await ctx.scope.recordEvent("configurator_view", { surface: "hosted" });
  }

  return (
    <div className="space-y-4">
      <section>
        <h1 className="text-2xl font-bold text-slate-900">Design your dock</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Draw your dock on the canvas and get a live planning-grade estimate as you
          build — or start with a guided questionnaire.
        </p>
      </section>
      <CanvasLanding
        defaultSite={saved ?? null}
        templates={templates}
        isReturning={isReturning}
        skipWizardByDefault={skipWizardByDefault}
      />
    </div>
  );
}
