/**
 * Application-domain types for the Phase 1 configurator (single dev tenant).
 *
 * These are the persistence/entity types (spec §7.4) the UI and API work with.
 * Engineering lives entirely in `@/engine`; nothing here re-derives geometry,
 * validation, or pricing — an estimate snapshot is just the engine's output
 * frozen onto an immutable Revision.
 */

import type { DockConfig, PricingResult, SiteConditions } from "@/engine";

/** Who authored a revision. Phase 1 only ever sees "customer". */
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
  createdAt: string;
  updatedAt: string;
}

/**
 * Minimal Lead record. The full state machine + abandoned-follow-up is Phase 3;
 * here we just persist the contact + consent the moment it is captured (§5.3),
 * plus a placeholder for the abandoned threshold.
 */
export interface Lead {
  id: string;
  tenantId: string;
  designId: string;
  customerId: string;
  customerContact: { email: string };
  consent: Consent;
  /** Phase 1: always "started"; Phase 3 introduces the full §5.4 machine. */
  status: "started";
  // TODO(Phase 3): flip started → abandoned after N days of inactivity.
  abandonedThresholdDays: number | null;
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
