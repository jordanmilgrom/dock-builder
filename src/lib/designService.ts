/**
 * Design service: orchestrates the engine + store + versioning for the
 * configurator's persistence flows (create, save revision, restore/branch,
 * contact capture). Server-side only. The single place that turns engine
 * output into immutable Revisions (§5.5) — routes stay thin.
 */

import {
  pricingEngine,
  validationEngine,
  type DockConfig,
  type PricingResult,
  type SiteConditions,
} from "@/engine";
import { generateStartingDesign } from "@/engine";
import { DEV_TENANT_ID, pricingProfileFor } from "./seed.js";
import * as store from "./store.js";
import type { AuthorRole, Consent, ConsentSource, Design, Revision } from "./types.js";
import { buildRevision, canCreateDraft } from "./versioning.js";

export function priceConfig(config: DockConfig): PricingResult {
  return pricingEngine(config, pricingProfileFor(config.dockType), {
    deliveryDistanceMiles: 30,
  });
}

export interface CreateResult {
  design: Design;
  revision: Revision;
}

/** Create a new draft design with a seeded starting design from the site (§5.3). */
export function createDesignFromSite(
  customerId: string,
  site: SiteConditions,
  opts: { name?: string; dockType?: DockConfig["dockType"]; use?: DockConfig["use"] } = {},
): CreateResult | { error: "draft_cap" } {
  if (!canCreateDraft(store.countDrafts(customerId))) return { error: "draft_cap" };

  const config = generateStartingDesign(site, {
    tenantId: DEV_TENANT_ID,
    ...(opts.dockType ? { dockType: opts.dockType } : {}),
    ...(opts.use ? { use: opts.use } : {}),
  });

  // Persist the customer's saved shoreline for next-time auto-fill (§5.6).
  if (store.getCustomer(customerId)) store.updateCustomer(customerId, { savedShoreline: site });

  const design = store.createDesign({
    tenantId: DEV_TENANT_ID,
    customerId,
    name: opts.name ?? `${cap(config.dockType)} dock`,
    currentRevisionId: "",
    status: "draft",
  });

  const revision = buildRevision({
    designId: design.id,
    previous: null,
    config,
    estimate: priceConfig(config),
    authorRole: "customer",
    authorId: customerId,
  });
  store.addRevision(revision);
  store.updateDesign(design.id, { currentRevisionId: revision.id });
  return { design: { ...design, currentRevisionId: revision.id }, revision };
}

/** Save an edited config as a new immutable revision (§5.5 revise loop). */
export function saveRevision(
  designId: string,
  config: DockConfig,
  authorId: string,
  authorRole: AuthorRole = "customer",
): Revision | undefined {
  const design = store.getDesign(designId);
  if (!design) return undefined;
  const previous = store.getRevision(design.currentRevisionId) ?? null;
  const revision = buildRevision({
    designId,
    previous,
    config,
    estimate: priceConfig(config),
    authorRole,
    authorId,
  });
  store.addRevision(revision);
  store.updateDesign(designId, { currentRevisionId: revision.id });
  return revision;
}

/** Restore or branch from an earlier revision (§5.5). Both create a new head. */
export function restoreOrBranch(
  designId: string,
  fromVersion: number,
  mode: "restore" | "branch",
  authorId: string,
): Revision | undefined {
  const source = store.listRevisions(designId).find((r) => r.version === fromVersion);
  if (!source) return undefined;
  const previous = store.getRevision(store.getDesign(designId)?.currentRevisionId ?? "") ?? null;
  const revision = buildRevision({
    designId,
    previous,
    config: source.config,
    estimate: priceConfig(source.config),
    authorRole: "customer",
    authorId,
    changeSummary: mode === "restore" ? `Restored v${fromVersion}` : `Branched from v${fromVersion}`,
  });
  store.addRevision(revision);
  store.updateDesign(designId, { currentRevisionId: revision.id });
  return revision;
}

/**
 * Capture contact + consent (§5.3). Attaches the email to the current customer
 * and creates a Lead (status "started"). The abandoned threshold is persisted
 * but not yet acted on (Phase 3).
 */
export function captureContact(
  customerId: string,
  designId: string,
  email: string,
  optedIn: boolean,
  source: ConsentSource,
): Consent {
  const consent: Consent = { optedIn, source, timestamp: new Date().toISOString() };
  store.updateCustomer(customerId, { email, consent });

  const existing = store.findLeadByDesign(designId);
  store.upsertLead({
    id: existing?.id ?? store.newId("lead"),
    tenantId: DEV_TENANT_ID,
    designId,
    customerId,
    customerContact: { email },
    consent,
    status: "started",
    abandonedThresholdDays: null, // TODO(Phase 3)
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
  return consent;
}

/** Validation + estimate for a config (always engine-derived). */
export function evaluate(config: DockConfig): {
  validation: ReturnType<typeof validationEngine>;
  estimate: PricingResult;
} {
  return { validation: validationEngine(config), estimate: priceConfig(config) };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
