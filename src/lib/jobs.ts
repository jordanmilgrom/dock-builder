import "server-only";
/**
 * Job-tracking layer (§5.4 job phase, Phase 5). A Job is its own linear state
 * machine joined to a Lead by leadId:
 *
 *   in_production ──▶ install_scheduled ──▶ complete
 *
 * A Job is created when a lead is accepted AND the tenant has
 * entitlements.jobTracking (Pro+). Each phase change fires the matching outbound
 * webhook. Customer-facing labels never use Won/Lost (§5.4).
 */

import type { Entitlements } from "./entitlements.js";
import type { Audience } from "./leadStatus.js";
import { fireEvent, type WebhookEventKind } from "./webhooks.js";
import type { TenantScope } from "./tenantScope.js";
import type { Job, JobStatus } from "./types.js";

export const JOB_STATES: JobStatus[] = ["in_production", "install_scheduled", "complete"];

const NEXT: Record<JobStatus, JobStatus | null> = {
  in_production: "install_scheduled",
  install_scheduled: "complete",
  complete: null,
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return NEXT[from] === to;
}

interface Labels {
  builder: string;
  customer: string;
}
const LABELS: Record<JobStatus, Labels> = {
  in_production: { builder: "In production", customer: "Being built" },
  install_scheduled: { builder: "Install scheduled", customer: "Installation scheduled" },
  complete: { builder: "Complete", customer: "Complete" },
};

export function jobStatusLabel(status: JobStatus, audience: Audience): string {
  return LABELS[status][audience];
}

export const BUILDER_JOB_TABS: { key: JobStatus | "all"; label: string }[] = [
  { key: "all", label: "All jobs" },
  { key: "in_production", label: "In production" },
  { key: "install_scheduled", label: "Install scheduled" },
  { key: "complete", label: "Complete" },
];

const webhookKindFor = (status: JobStatus): WebhookEventKind => `job.${status}` as WebhookEventKind;

/**
 * Create a Job for a freshly-accepted lead, if the tenant is entitled. Idempotent
 * (returns the existing Job if present). Fires job.in_production on creation.
 */
export async function createJobIfEntitled(
  scope: TenantScope,
  leadId: string,
  entitlements: Pick<Entitlements, "jobTracking">,
): Promise<Job | null> {
  if (!entitlements.jobTracking) return null;
  const existing = await scope.getJobByLead(leadId);
  if (existing) return existing;
  const job = await scope.createJob({ leadId });
  const withMilestone = await scope.updateJob(job.id, {
    milestones: [{ label: "In production", at: new Date().toISOString() }],
  });
  await fireEvent(scope, webhookKindFor("in_production"), { jobId: job.id, leadId, status: "in_production" });
  return withMilestone ?? job;
}

/** Advance a Job one phase forward. Records a milestone + fires the webhook. */
export async function advanceJob(
  scope: TenantScope,
  jobId: string,
  to: JobStatus,
): Promise<Job | { error: "not_found" | "bad_state" }> {
  const job = await scope.getJob(jobId);
  if (!job) return { error: "not_found" };
  if (!canTransitionJob(job.status, to)) return { error: "bad_state" };
  const milestones = [...job.milestones, { label: jobStatusLabel(to, "builder"), at: new Date().toISOString() }];
  const updated = await scope.updateJob(jobId, { status: to, milestones });
  if (!updated) return { error: "not_found" };
  await fireEvent(scope, webhookKindFor(to), { jobId, leadId: job.leadId, status: to });
  return updated;
}
