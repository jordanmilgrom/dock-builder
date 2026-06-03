import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import BillingButtons from "@/components/BillingButtons";
import BrandingEditor from "@/components/BrandingEditor";
import BuilderSettings from "@/components/BuilderSettings";
import CustomDomainConfig from "@/components/CustomDomainConfig";
import EmbedSnippet from "@/components/EmbedSnippet";
import NotificationChannels from "@/components/NotificationChannels";
import NotificationsPanel from "@/components/NotificationsPanel";
import PricingEditor, { type EditorProfile } from "@/components/PricingEditor";
import PricingProfilesManager from "@/components/PricingProfilesManager";
import TeamManager from "@/components/TeamManager";
import WebhookManager from "@/components/WebhookManager";
import { getDashboardMetrics } from "@/lib/analytics";
import { requireBuilder } from "@/lib/authz";
import { CUSTOM_DOMAIN_CNAME_TARGET } from "@/lib/customDomain";
import { prisma } from "@/lib/db";
import { embedSnippet } from "@/lib/embed";
import type { Entitlements } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export default async function BuilderDashboard() {
  const builder = requireBuilder();
  if (!builder) redirect("/builder/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: builder.tenantId },
    include: { branding: true, pricingProfiles: { where: { isDefault: true }, include: { items: true } } },
  });
  if (!tenant) redirect("/builder/login");

  const ent = tenant.entitlements as unknown as Entitlements;
  const isAdmin = builder.role === "builder_admin";

  const host = headers().get("host") ?? "app.com";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const appOrigin = process.env.APP_ORIGIN ?? `${proto}://${host}`;
  const metrics = ent.analytics ? await getDashboardMetrics(tenant.id) : null;
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
        <div className="flex items-center gap-2">
          <Link href="/builder/leads" className="rounded border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-cyan-50">
            Leads
          </Link>
          {ent.jobTracking && (
            <Link href="/builder/jobs" className="rounded border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-cyan-50">
              Jobs
            </Link>
          )}
          <Link href="/builder/customers" className="rounded border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-cyan-50">
            Customers
          </Link>
          <a
            href={`/?tenant=${tenant.slug}`}
            target="_blank"
            className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800"
          >
            View hosted page ↗
          </a>
        </div>
      </div>

      <NotificationsPanel />

      {metrics && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Analytics — last {metrics.range.days} days</h3>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Metric label="Views" value={metrics.totals.configurator_view} />
            <Metric label="Designs started" value={metrics.totals.design_started} />
            <Metric label="Completion" value={`${Math.round(metrics.rates.completionRate * 100)}%`} />
            <Metric label="Abandon" value={`${Math.round(metrics.rates.abandonRate * 100)}%`} />
            <Metric label="Submitted" value={metrics.totals.design_submitted} />
            <Metric label="Quotes sent" value={metrics.totals.quote_sent} />
            <Metric label="Won" value={metrics.totals.lead_accepted} />
            <Metric label="Conversion" value={`${Math.round(metrics.rates.conversionRate * 100)}%`} />
          </div>
          {metrics.popularConfigs.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Most popular: {metrics.popularConfigs.slice(0, 3).map((p) => `${p.dockType} (${p.count})`).join(", ")}
            </p>
          )}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Embed on your site</h3>
        <EmbedSnippet entitled={ent.embed} snippet={embedSnippet(appOrigin, tenant.slug)} />
      </section>

      {isAdmin && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Custom domain</h3>
          <CustomDomainConfig
            entitled={ent.customDomain}
            initialDomain={tenant.customDomain}
            verified={Boolean(tenant.customDomainVerifiedAt)}
            cnameTarget={CUSTOM_DOMAIN_CNAME_TARGET}
          />
        </section>
      )}

      {isAdmin && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Team</h3>
          <TeamManager entitled={ent.team} />
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Pricing profiles</h3>
        <PricingProfilesManager entitled={ent.multipleProfiles} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Notification channels</h3>
        <NotificationChannels
          slackEnabled={ent.slackNotifications}
          smsEnabled={ent.smsNotifications}
          initialSlackUrl={tenant.slackWebhookUrl}
        />
      </section>

      {isAdmin && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Outbound webhooks</h3>
          <WebhookManager entitled={ent.webhooks} />
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Subscription</h3>
        <p className="mb-3 text-xs text-slate-500">
          A valid subscription is your trust signal — Stripe handles billing &amp; fraud. Lead cap:{" "}
          {tenant.leadCap === null ? "unlimited" : `${tenant.leadCap}/mo`}.
        </p>
        <BillingButtons currentTier={tenant.tier} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Lead follow-up</h3>
        <p className="mb-3 text-xs text-slate-500">
          {ent.abandonedFollowUp
            ? "Abandoned-lead notifications are on for your plan."
            : "Abandoned-lead notifications require Pro or Premium."}
        </p>
        <BuilderSettings initialDays={tenant.abandonedThresholdDays} />
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

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-slate-100 p-2">
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
