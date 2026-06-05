/**
 * Lead state machine (§5.4) — the heart of the Phase 3 CRM loop.
 *
 * Pure module (no I/O) so it is trivially testable and shared by the lead
 * service, the sweep job, and every UI surface. Two rules matter most:
 *   1. `started → abandoned` is DERIVED, never user-set — computed from
 *      lastActivityAt + the tenant's abandonedThresholdDays (§10 #7).
 *   2. Dual vocabulary: every state maps to a builder label AND a customer
 *      label. Won/Lost NEVER appear in customer copy. `leadStatusLabel` is the
 *      single helper used everywhere.
 *
 * Job-phase states (in_production / install_scheduled / complete) are Phase 5.
 */

export type LeadStatus =
  | "started"
  | "abandoned"
  | "submitted"
  | "in_review"
  | "quoted"
  | "accepted"
  | "closed";

export const LEAD_STATES: LeadStatus[] = [
  "started",
  "abandoned",
  "submitted",
  "in_review",
  "quoted",
  "accepted",
  "closed",
];

export type Audience = "builder" | "customer";

/**
 * Allowed forward transitions. `started → abandoned` is included because the
 * sweep persists it, but it is only ever reached by derivation (never user
 * action). Re-quoting is NOT a transition (status stays "quoted") — see
 * leadService.sendQuote.
 */
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  started: ["abandoned", "submitted"],
  abandoned: ["submitted"], // customer can come back and submit
  submitted: ["in_review"],
  in_review: ["quoted"],
  quoted: ["accepted", "closed"],
  accepted: [],
  closed: [],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when a still-"started" lead has gone quiet past the tenant threshold. */
export function isAbandoned(
  storedStatus: LeadStatus,
  lastActivityAt: Date | string,
  thresholdDays: number,
  now: Date = new Date(),
): boolean {
  if (storedStatus !== "started") return false;
  const last = typeof lastActivityAt === "string" ? new Date(lastActivityAt) : lastActivityAt;
  return last.getTime() + thresholdDays * DAY_MS < now.getTime();
}

/**
 * Effective status as shown/filtered: a "started" lead past its threshold reads
 * as "abandoned" even if the sweep hasn't persisted it yet. All other stored
 * states pass through unchanged.
 */
export function deriveStatus(
  storedStatus: LeadStatus,
  lastActivityAt: Date | string,
  thresholdDays: number,
  now: Date = new Date(),
): LeadStatus {
  return isAbandoned(storedStatus, lastActivityAt, thresholdDays, now) ? "abandoned" : storedStatus;
}

interface Labels {
  builder: string;
  customer: string;
}

// Dual vocabulary (§5.4). Customer copy is deliberately free of Won/Lost.
const LABELS: Record<LeadStatus, Labels> = {
  // The customer's pre-submission draft carries no builder-side status badge.
  started: { builder: "Started", customer: "" },
  abandoned: { builder: "Abandoned — follow up", customer: "Saved — resume anytime" },
  submitted: { builder: "New — submitted", customer: "Submitted — awaiting review" },
  in_review: { builder: "In review", customer: "Being reviewed" },
  quoted: { builder: "Quote sent", customer: "Quote ready" },
  accepted: { builder: "Won — accepted", customer: "Accepted" },
  closed: { builder: "Lost — closed", customer: "Closed" },
};

/** The single label helper used by every UI surface. */
export function leadStatusLabel(state: LeadStatus, audience: Audience): string {
  return LABELS[state][audience];
}

/** Builder-facing filter tabs for the leads inbox (Abandoned is first-class). */
export const BUILDER_FILTER_TABS: { key: LeadStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "abandoned", label: "Abandoned — follow up" },
  { key: "submitted", label: "New — submitted" },
  { key: "in_review", label: "In review" },
  { key: "quoted", label: "Quote sent" },
  { key: "accepted", label: "Won" },
  { key: "closed", label: "Closed" },
];
