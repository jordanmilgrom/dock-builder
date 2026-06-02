/**
 * Pure design-versioning logic (spec §5.5).
 *
 * Revisions are immutable snapshots. These helpers compute the next revision
 * and a human-readable change summary, and enforce the 3-draft cap. They never
 * touch I/O — the store persists what they return.
 */

import type { DockConfig, PricingResult } from "@/engine";
import type { AuthorRole, Revision } from "./types.js";

/** Max Drafts per customer per tenant (spec §5.4/§5.8). */
export const DRAFT_CAP = 3;

export function canCreateDraft(existingDraftCount: number): boolean {
  return existingDraftCount < DRAFT_CAP;
}

let counter = 0;
function genId(prefix: string): string {
  // Prefer a real UUID; fall back to a monotonic id in non-crypto contexts.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `${prefix}_${c.randomUUID()}`;
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export interface NewRevisionInput {
  designId: string;
  previous: Revision | null;
  config: DockConfig;
  estimate: PricingResult | null;
  authorRole: AuthorRole;
  authorId: string;
  /** Override the auto-computed summary (e.g. "Restored v2", "Branched from v3"). */
  changeSummary?: string;
  now?: () => Date;
}

/** Build the next immutable Revision from the previous one (does not persist). */
export function buildRevision(input: NewRevisionInput): Revision {
  const now = (input.now ?? (() => new Date()))();
  const version = (input.previous?.version ?? 0) + 1;
  const summary =
    input.changeSummary ??
    summarizeConfigChange(input.previous?.config ?? null, input.config);
  return {
    id: genId("rev"),
    designId: input.designId,
    version,
    config: structuredClone(input.config),
    schemaVersion: input.config.schemaVersion,
    estimateSnapshot: input.estimate ? structuredClone(input.estimate) : null,
    authorRole: input.authorRole,
    authorId: input.authorId,
    createdAt: now.toISOString(),
    changeSummary: summary,
  };
}

/** Short, deterministic description of what changed between two configs. */
export function summarizeConfigChange(
  prev: DockConfig | null,
  next: DockConfig,
): string {
  if (!prev) return "Initial design";
  const parts: string[] = [];

  if (prev.dockType !== next.dockType)
    parts.push(`type ${prev.dockType}→${next.dockType}`);
  if (prev.overall.lengthFt !== next.overall.lengthFt)
    parts.push(`length ${prev.overall.lengthFt}→${next.overall.lengthFt} ft`);
  if (prev.overall.widthFt !== next.overall.widthFt)
    parts.push(`width ${prev.overall.widthFt}→${next.overall.widthFt} ft`);
  if (prev.overall.deckingMaterial !== next.overall.deckingMaterial)
    parts.push(`decking ${prev.overall.deckingMaterial}→${next.overall.deckingMaterial}`);
  if (prev.overall.frameMaterial !== next.overall.frameMaterial)
    parts.push(`frame ${prev.overall.frameMaterial}→${next.overall.frameMaterial}`);
  if ((prev.gangway?.present ?? false) !== (next.gangway?.present ?? false))
    parts.push(next.gangway?.present ? "added gangway" : "removed gangway");

  const accChange = summarizeAccessories(prev, next);
  parts.push(...accChange);

  return parts.length > 0 ? capitalize(parts.join("; ")) : "No structural change";
}

function summarizeAccessories(prev: DockConfig, next: DockConfig): string[] {
  const count = (c: DockConfig): Map<string, number> => {
    const m = new Map<string, number>();
    for (const a of c.accessories ?? []) m.set(a.type, (m.get(a.type) ?? 0) + (a.qty ?? 1));
    return m;
  };
  const a = count(prev);
  const b = count(next);
  const out: string[] = [];
  const types = new Set<string>([...a.keys(), ...b.keys()]);
  for (const t of [...types].sort()) {
    const before = a.get(t) ?? 0;
    const after = b.get(t) ?? 0;
    if (before === after) continue;
    if (before === 0) out.push(`added ${t}`);
    else if (after === 0) out.push(`removed ${t}`);
    else out.push(`${t} ${before}→${after}`);
  }
  return out;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}
