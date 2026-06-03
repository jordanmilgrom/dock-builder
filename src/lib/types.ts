/**
 * Application-domain types for the Phase 1 configurator (single dev tenant).
 *
 * These are the persistence/entity types (spec §7.4) the UI and API work with.
 * Engineering lives entirely in `@/engine`; nothing here re-derives geometry,
 * validation, or pricing — an estimate snapshot is just the engine's output
 * frozen onto an immutable Revision.
 */

import type { DockConfig, PricingResult, SiteConditions } from "@/engine";
import type { LeadStatus } from "./leadStatus.js";

/** Who authored a revision: the customer, or the builder (re-quote, §5.5). */
export type AuthorRole = "customer" | "builder";

/** Where a contact/consent was captured (§5.3). */
export type ConsentSource = "save_gate" | "price_gate" | "submit";

export interface Consent {
  optedIn: boolean;
  source: ConsentSource;
  timestamp: string; // ISO
}

export interface Customer {
  id: string;
  email: string;
  /** Auto-fills the questionnaire next time (§5.6). */
  savedShoreline?: SiteConditions;
  consent?: Consent;
  /** Builder's free-text CRM notes (§5.6); 5,000 char cap at the API boundary. */
  notes?: string;
  createdAt: string;
}

/** Immutable snapshot of a design at a point in time (spec §5.5). */
export interface Revision {
  id: string;
  designId: string;
  version: number;
  config: DockConfig;
  schemaVersion: number;
  /** The engine's pricing output, frozen at snapshot time. */
  estimateSnapshot: PricingResult | null;
  authorRole: AuthorRole;
  authorId: string;
  createdAt: string;
  changeSummary: string;
}

/** A design slot owned by a customer; max 3 drafts per customer (§5.4/§5.5). */
export interface Design {
  id: string;
  tenantId: string;
  customerId: string;
  name: string;
  currentRevisionId: string;
  /** Phase 1 only distinguishes draft vs. submitted; full machine is Phase 3. */
  status: "draft" | "submitted";
  /** Phase 4: optional pricing profile (Premium multi-profile); null → default. */
  pricingProfileId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A saved DockConfig the customer can "start from" (§5.6, Phase 4). */
export interface Template {
  id: string;
  tenantId: string;
  name: string;
  config: DockConfig;
  createdBy: string;
  createdAt: string;
}

/** Analytics event kinds (§5.6, Phase 4). */
export type EventKind =
  | "configurator_view"
  | "design_started"
  | "design_submitted"
  | "lead_abandoned"
  | "quote_sent"
  | "lead_accepted";

/** §5.4 job phase (Phase 5). Its own state machine, joined to a Lead by leadId. */
export type JobStatus = "in_production" | "install_scheduled" | "complete";

export interface JobMilestone {
  label: string;
  at: string; // ISO
}

export interface Job {
  id: string;
  tenantId: string;
  leadId: string;
  status: JobStatus;
  milestones: JobMilestone[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A tenant-configured outbound webhook target (§5.9). Secret is never exposed. */
export interface WebhookEndpointSummary {
  id: string;
  url: string;
  eventKinds: string[];
  createdAt: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
}

/**
 * A captured Lead and its §5.4 state. `status` is the PERSISTED state; the
 * effective status (started → abandoned) is derived from `lastActivityAt` and
 * the tenant's threshold via `leadStatus.deriveStatus`.
 */
export interface Lead {
  id: string;
  tenantId: string;
  designId: string;
  customerId: string;
  customerContact: { email: string };
  consent: Consent;
  status: LeadStatus;
  /** Bumped on every customer interaction; drives the abandoned derivation. */
  lastActivityAt: string;
  /** Set when the customer submits the design. */
  submittedAt: string | null;
  /** Revision the builder last sent as a quote (re-quote updates it; status stays "quoted"). */
  quotedRevisionId: string | null;
  createdAt: string;
}

/** A builder dashboard notification (§8 Phase 3 item 5). */
export interface Notification {
  id: string;
  tenantId: string;
  type: "new_lead" | "abandoned_lead";
  leadId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/** Per-tenant branding (single dev tenant in Phase 1). */
export interface Branding {
  tenantId: string;
  name: string;
  /** Text logo fallback; an uploaded image (Phase 2 onboarding) wins when set. */
  logoText: string;
  /** Uploaded logo URL (Phase 2 onboarding). */
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  /** "powered by" badge toggle (tier-gated later). */
  removeBadge: boolean;
}
