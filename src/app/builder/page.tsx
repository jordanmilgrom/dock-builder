import { redirect } from "next/navigation";
import BillingButtons from "@/components/BillingButtons";
import BrandingEditor from "@/components/BrandingEditor";
import PricingEditor, { type EditorProfile } from "@/components/PricingEditor";
import { requireBuilder } from "@/lib/authz";
import { prisma } from "@/lib/db";
import type { Entitlements } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export default async function BuilderDashboard() {
  const builder = requireBuilder();
  if (!builder) redirect("/builder/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: builder.tenantId },
    include: { branding: true, pricingProfiles: { include: { items: true } } },
  });
  if (!tenant) redirect("/builder/login");

  const ent = tenant.entitlements as unknown as Entitlements;
  const profiles: EditorProfile[] = tenant.pricingProfiles
    .sort((a, b) => a.dockType.localeCompare(b.dockType))
    .map((p) => ({
      dockType: p.dockType,
      priceVisibility: p.priceVisibility,
      items: p.items.map((it) => ({
        id: it.id,
        key: it.key,
        label: it.label ?? it.key,
        unit: it.unit,
        unitPrice: it.unitPrice,
        enabled: it.enabled,
      })),
    }));

  const trialEnds = tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toLocaleDateString("en-US") : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{tenant.name} — dashboard</h1>
          <p className="text-xs text-slate-500">
            Plan: <span className="font-semibold uppercase">{tenant.tier}</span> ·{" "}
            <span className="capitalize">{tenant.subscriptionStatus.replace("_", " ")}</span>
            {tenant.subscriptionStatus === "trialing" && trialEnds ? ` · trial ends ${trialEnds}` : ""}
          </p>
        </div>
        <a
          href={`/?tenant=${tenant.slug}`}
          target="_blank"
          className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800"
        >
          View hosted page ↗
        </a>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Subscription</h3>
        <p className="mb-3 text-xs text-slate-500">
          A valid subscription is your trust signal — Stripe handles billing &amp; fraud. Lead cap:{" "}
          {tenant.leadCap === null ? "unlimited" : `${tenant.leadCap}/mo`}.
        </p>
        <BillingButtons currentTier={tenant.tier} />
      </section>

      <BrandingEditor
        canRemoveBadge={ent.removeBadge}
        initial={{
          name: tenant.branding?.name ?? tenant.name,
          logoText: tenant.branding?.logoText ?? tenant.name.toUpperCase(),
          primaryColor: tenant.branding?.primaryColor ?? "#0e7490",
          secondaryColor: tenant.branding?.secondaryColor ?? "#0f172a",
          removeBadge: tenant.branding?.removeBadge ?? false,
          slug: tenant.slug,
        }}
      />

      <PricingEditor profiles={profiles} />
    </div>
  );
}
