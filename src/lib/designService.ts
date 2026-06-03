/**
 * Design service: orchestrates the engine + tenant-scoped store + versioning for
 * the configurator's persistence flows (create, save revision, restore/branch,
 * contact capture). Server-side only. The single place that turns engine output
 * into immutable Revisions (§5.5) — routes stay thin.
 *
 * Phase 2: every function takes a `TenantScope` (so all reads/writes are
 * tenant-filtered) and is async (Postgres-backed). The function set and
 * semantics are unchanged from Phase 1.
 */

import {
  pricingEngine,
  validationEngine,
  type DockConfig,
  type PricingResult,
  type SiteConditions,
} from "@/engine";
import { generateStartingDesign } from "@/engine";
import type { TenantScope } from "./tenantScope.js";
import type { AuthorRole, Consent, ConsentSource, Design, Revision } from "./types.js";
import { buildRevision, canCreateDraft } from "./versioning.js";

export async function priceConfig(
  scope: TenantScope,
  config: DockConfig,
  opts: { pricingProfileId?: string | null } = {},
): Promise<PricingResult> {
  let profile;
  // Premium multi-profile: a design may pin a specific profile. Only honor it
  // when its dock type matches; otherwise fall back to the tenant default.
  if (opts.pricingProfileId) {
    const byId = await scope.getPricingProfileById(opts.pricingProfileId);
    if (byId && byId.dockType === config.dockType) profile = byId;
  }
  if (!profile) profile = await scope.getPricingProfile(config.dockType);
  if (!profile) throw new Error(`No pricing profile for dockType "${config.dockType}" in tenant ${scope.tenantId}`);
  return pricingEngine(config, profile, { deliveryDistanceMiles: 30 });
}

export interface CreateResult {
  design: Design;
  revision: Revision;
}

/** Create a new draft design with a seeded starting design from the site (§5.3). */
export async function createDesignFromSite(
  scope: TenantScope,
  customerId: string,
  site: SiteConditions,
  opts: { name?: string; dockType?: DockConfig["dockType"]; use?: DockConfig["use"] } = {},
): Promise<CreateResult | { error: "draft_cap" }> {
  if (!canCreateDraft(await scope.countDrafts(customerId))) return { error: "draft_cap" };

  const config = generateStartingDesign(site, {
    tenantId: scope.tenantId,
    ...(opts.dockType ? { dockType: opts.dockType } : {}),
    ...(opts.use ? { use: opts.use } : {}),
  });

  // Persist the customer's saved shoreline for next-time auto-fill (§5.6).
  if (await scope.getCustomer(customerId)) await scope.updateCustomer(customerId, { savedShoreline: site });

  return persistNewDesign(scope, customerId, config, opts.name ?? `${cap(config.dockType)} dock`);
}

/** Create a new draft design from a saved Template's config (§5.6, Phase 4). */
export async function createDesignFromTemplate(
  scope: TenantScope,
  customerId: string,
  templateId: string,
  opts: { name?: string } = {},
): Promise<CreateResult | { error: "draft_cap" | "not_found" }> {
  const template = await scope.getTemplate(templateId);
  if (!template) return { error: "not_found" };
  if (!canCreateDraft(await scope.countDrafts(customerId))) return { error: "draft_cap" };
  // Re-stamp the config onto this tenant so it can never carry a foreign tenantId.
  const config: DockConfig = { ...template.config, tenantId: scope.tenantId };
  return persistNewDesign(scope, customerId, config, opts.name ?? template.name);
}

/** Shared path: persist a brand-new design + its v1 revision, emit analytics. */
async function persistNewDesign(
  scope: TenantScope,
  customerId: string,
  config: DockConfig,
  name: string,
): Promise<CreateResult> {
  const design = await scope.createDesign({ customerId, name, currentRevisionId: "", status: "draft" });
  const revision = buildRevision({
    designId: design.id,
    previous: null,
    config,
    estimate: await priceConfig(scope, config),
    authorRole: "customer",
    authorId: customerId,
  });
  await scope.addRevision(revision);
  await scope.updateDesign(design.id, { currentRevisionId: revision.id });
  await scope.recordEvent("design_started", { designId: design.id, dockType: config.dockType });
  return { design: { ...design, currentRevisionId: revision.id }, revision };
}

/** Save an edited config as a new immutable revision (§5.5 revise loop). */
export async function saveRevision(
  scope: TenantScope,
  designId: string,
  config: DockConfig,
  authorId: string,
  authorRole: AuthorRole = "customer",
): Promise<Revision | undefined> {
  const design = await scope.getDesign(designId);
  if (!design) return undefined;
  const previous = (await scope.getRevision(design.currentRevisionId)) ?? null;
  const revision = buildRevision({
    designId,
    previous,
    config,
    estimate: await priceConfig(scope, config, { pricingProfileId: design.pricingProfileId }),
    authorRole,
    authorId,
  });
  await scope.addRevision(revision);
  await scope.updateDesign(designId, { currentRevisionId: revision.id });

  // Customer edits keep a captured-but-unsubmitted lead "fresh" so the abandoned
  // clock (§10 #7) only starts after they actually go quiet.
  if (authorRole === "customer") {
    const lead = await scope.findLeadByDesign(designId);
    if (lead && lead.status === "started") {
      await scope.updateLead(lead.id, { lastActivityAt: new Date().toISOString() });
    }
  }
  return revision;
}

/** Restore or branch from an earlier revision (§5.5). Both create a new head. */
export async function restoreOrBranch(
  scope: TenantScope,
  designId: string,
  fromVersion: number,
  mode: "restore" | "branch",
  authorId: string,
): Promise<Revision | undefined> {
  const source = (await scope.listRevisions(designId)).find((r) => r.version === fromVersion);
  if (!source) return undefined;
  const design = await scope.getDesign(designId);
  const previous = design ? (await scope.getRevision(design.currentRevisionId)) ?? null : null;
  const revision = buildRevision({
    designId,
    previous,
    config: source.config,
    estimate: await priceConfig(scope, source.config, { pricingProfileId: design?.pricingProfileId }),
    authorRole: "customer",
    authorId,
    changeSummary: mode === "restore" ? `Restored v${fromVersion}` : `Branched from v${fromVersion}`,
  });
  await scope.addRevision(revision);
  await scope.updateDesign(designId, { currentRevisionId: revision.id });
  return revision;
}

/**
 * Capture contact + consent (§5.3). Attaches the email to the current customer
 * and creates a Lead (status "started"). The abandoned threshold is persisted
 * but not yet acted on (Phase 3).
 */
export async function captureContact(
  scope: TenantScope,
  customerId: string,
  designId: string,
  email: string,
  optedIn: boolean,
  source: ConsentSource,
): Promise<Consent> {
  const consent: Consent = { optedIn, source, timestamp: new Date().toISOString() };
  await scope.updateCustomer(customerId, { email, consent });

  const now = new Date().toISOString();
  const existing = await scope.findLeadByDesign(designId);
  await scope.upsertLead({
    id: existing?.id ?? `lead_${crypto.randomUUID()}`,
    designId,
    customerId,
    customerContact: { email },
    consent,
    // started is created the moment contact is captured (§5.4); a re-capture
    // just refreshes activity and never regresses an advanced state.
    status: existing?.status ?? "started",
    lastActivityAt: now,
    submittedAt: existing?.submittedAt ?? null,
    quotedRevisionId: existing?.quotedRevisionId ?? null,
    createdAt: existing?.createdAt ?? now,
  });
  return consent;
}

/** Validation + estimate for a config (always engine-derived). */
export async function evaluate(
  scope: TenantScope,
  config: DockConfig,
  opts: { pricingProfileId?: string | null } = {},
): Promise<{ validation: ReturnType<typeof validationEngine>; estimate: PricingResult }> {
  return { validation: validationEngine(config), estimate: await priceConfig(scope, config, opts) };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
