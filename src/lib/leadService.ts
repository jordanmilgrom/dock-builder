import "server-only";
/**
 * Lead lifecycle + CRM operations (§5.4–§5.6). The single place that advances the
 * §5.4 state machine and fires builder notifications. Tenant-scoped + async.
 *
 *   started ──submit──▶ submitted ──builder opens──▶ in_review ──send quote──▶ quoted
 *   (derived) abandoned ─────────────▶ submitted                  quoted ──▶ accepted | closed
 *
 * Re-quoting does NOT advance status (stays "quoted"); it records a new
 * quotedRevisionId and produces a new immutable builder Revision (§5.5).
 */

import type { DockConfig } from "@/engine";
import { prisma } from "./db.js";
import { saveRevision } from "./designService.js";
import type { Entitlements } from "./entitlements.js";
import { createJobIfEntitled } from "./jobs.js";
import { canTransition, deriveStatus, type LeadStatus } from "./leadStatus.js";
import {
  abandonedNotificationAllowed,
  dispatchNotification,
  type NotificationType,
} from "./notifications.js";
import type { TenantScope } from "./tenantScope.js";
import type { Lead, Revision } from "./types.js";
import { fireEvent } from "./webhooks.js";

/** Builder users who should receive notifications for a tenant. */
export async function getBuilderRecipients(tenantId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, role: { in: ["builder_admin", "builder_member"] } },
    select: { email: true },
  });
  return users.map((u) => u.email);
}

async function emit(
  scope: TenantScope,
  type: NotificationType,
  lead: Lead,
  title: string,
  body: string,
): Promise<void> {
  // Panel row (dashboard) + multi-channel delivery (email always; SMS/Slack when
  // configured + entitled). Each channel's failure is isolated.
  await scope.createNotification({ type, leadId: lead.id, title, body });
  const recipients = await getBuilderRecipients(scope.tenantId);
  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { slackWebhookUrl: true, entitlements: true },
  });
  const entitlements = (tenant?.entitlements as unknown as Entitlements) ?? null;
  await dispatchNotification({
    tenantId: scope.tenantId,
    type,
    subject: title,
    body,
    leadId: lead.id,
    emailRecipients: recipients,
    slackWebhookUrl: tenant?.slackWebhookUrl ?? null,
    entitlements: entitlements ?? { smsNotifications: false, slackNotifications: false },
  });
}

/** Customer submits the design (§5.4 started/abandoned → submitted). Fires new-lead. */
export async function submitDesign(
  scope: TenantScope,
  designId: string,
): Promise<Lead | { error: "no_lead" | "already_submitted" }> {
  const lead = await scope.findLeadByDesign(designId);
  if (!lead) return { error: "no_lead" }; // contact must be captured first (§5.3)
  if (["submitted", "in_review", "quoted", "accepted", "closed"].includes(lead.status)) {
    return { error: "already_submitted" };
  }
  const now = new Date().toISOString();
  await scope.updateDesign(designId, { status: "submitted" });
  const updated = await scope.updateLead(lead.id, {
    status: "submitted",
    submittedAt: now,
    lastActivityAt: now,
  });
  const finalLead = updated ?? lead;
  await scope.recordEvent("design_submitted", { leadId: finalLead.id, designId });
  await fireEvent(scope, "lead.submitted", { leadId: finalLead.id, designId, email: finalLead.customerContact.email });
  await emit(
    scope,
    "new_lead",
    finalLead,
    "New lead submitted",
    `${finalLead.customerContact.email} submitted a dock design for review.`,
  );
  return finalLead;
}

/** Builder opens a lead → auto-advance submitted → in_review (free "seen" signal). */
export async function builderOpenLead(scope: TenantScope, leadId: string): Promise<Lead | undefined> {
  const lead = await scope.getLead(leadId);
  if (!lead) return undefined;
  if (lead.status === "submitted") {
    return (await scope.updateLead(leadId, { status: "in_review" })) ?? lead;
  }
  return lead;
}

/**
 * Builder sends a quote (or re-quote). When `config` is supplied, a new builder
 * Revision is saved first (revise-and-resend, §5.5). First quote advances
 * in_review/submitted → quoted; a re-quote keeps status "quoted" and only
 * updates quotedRevisionId. The customer's original submission is preserved as
 * the earliest immutable revision.
 */
export async function sendQuote(
  scope: TenantScope,
  leadId: string,
  builderUserId: string,
  opts: { config?: DockConfig } = {},
): Promise<{ lead: Lead; revision: Revision } | { error: "not_found" | "bad_state" }> {
  const lead = await scope.getLead(leadId);
  if (!lead) return { error: "not_found" };
  if (!["submitted", "in_review", "quoted"].includes(lead.status)) return { error: "bad_state" };

  // Optionally revise the design as a builder-authored revision.
  if (opts.config) {
    const rev = await saveRevision(scope, lead.designId, opts.config, builderUserId, "builder");
    if (!rev) return { error: "not_found" };
    await fireEvent(scope, "design.revised", { leadId, designId: lead.designId, revisionId: rev.id, version: rev.version });
  }
  const design = await scope.getDesign(lead.designId);
  if (!design) return { error: "not_found" };
  const headRevisionId = design.currentRevisionId;

  // First quote advances in_review/submitted → quoted; a re-quote keeps "quoted"
  // and only records the new revision (§5.5). Either way the target is "quoted".
  const updated = await scope.updateLead(leadId, {
    status: "quoted",
    quotedRevisionId: headRevisionId,
  });
  await scope.recordEvent("quote_sent", { leadId, revisionId: headRevisionId });
  await fireEvent(scope, "lead.quoted", { leadId, revisionId: headRevisionId, total: (await scope.getRevision(headRevisionId))?.estimateSnapshot?.total ?? null });
  const revision = (await scope.getRevision(headRevisionId))!;
  return { lead: updated ?? lead, revision };
}

/** End the quote phase: quoted → accepted (Won) or quoted → closed (Lost). */
export async function setOutcome(
  scope: TenantScope,
  leadId: string,
  outcome: "accepted" | "closed",
  entitlements: Pick<Entitlements, "jobTracking"> = { jobTracking: false },
): Promise<Lead | { error: "not_found" | "bad_state" }> {
  const lead = await scope.getLead(leadId);
  if (!lead) return { error: "not_found" };
  if (!canTransition(lead.status, outcome)) return { error: "bad_state" };
  const updated = (await scope.updateLead(leadId, { status: outcome })) ?? lead;
  if (outcome === "accepted") {
    await scope.recordEvent("lead_accepted", { leadId });
    await fireEvent(scope, "lead.accepted", { leadId, email: updated.customerContact.email });
    // Entitled tenants spin up a Job (in_production); others stay at accepted.
    await createJobIfEntitled(scope, leadId, entitlements);
  } else {
    await fireEvent(scope, "lead.closed", { leadId });
  }
  return updated;
}

/** Mark a started lead abandoned (used by the sweep). Idempotent. */
export async function markAbandoned(scope: TenantScope, leadId: string): Promise<Lead | undefined> {
  return scope.updateLead(leadId, { status: "abandoned" });
}

/** Fire the abandoned-lead notification, gated on the Pro+ entitlement (§10 #2). */
export async function notifyAbandoned(
  scope: TenantScope,
  lead: Lead,
  entitlements: Pick<Entitlements, "abandonedFollowUp">,
): Promise<boolean> {
  if (!abandonedNotificationAllowed(entitlements)) return false;
  await emit(
    scope,
    "abandoned_lead",
    lead,
    "Abandoned lead — follow up",
    `${lead.customerContact.email} started a design but hasn't submitted. Reach out to win the job.`,
  );
  return true;
}

export interface LeadSummary {
  lead: Lead;
  derivedStatus: LeadStatus;
  designName: string;
  dockType: string | null;
  customerEmail: string;
  total: number | null;
  currency: string;
}

/** Leads decorated with derived status + design/quote summary for the inbox. */
export async function listLeadSummaries(scope: TenantScope, thresholdDays: number): Promise<LeadSummary[]> {
  const leads = await scope.listLeads();
  const now = new Date();
  return Promise.all(
    leads.map(async (lead) => {
      const design = await scope.getDesign(lead.designId);
      const rev = design ? await scope.getRevision(design.currentRevisionId) : undefined;
      return {
        lead,
        derivedStatus: deriveStatus(lead.status, lead.lastActivityAt, thresholdDays, now),
        designName: design?.name ?? "(deleted design)",
        dockType: rev?.config.dockType ?? null,
        customerEmail: lead.customerContact.email,
        total: rev?.estimateSnapshot?.total ?? null,
        currency: rev?.estimateSnapshot?.currency ?? "USD",
      };
    }),
  );
}
