import "server-only";
/**
 * Analytics roll-ups (§5.6, Phase 4). Events are written via
 * `scope.recordEvent(kind, meta)` from existing call sites (no heavy SDK).
 * `getDashboardMetrics` aggregates them on read — fine while the table is small.
 *
 * Swap path (documented in PHASE4.md): when the Event table grows, replace the
 * grouped queries here with a materialized view refreshed on a schedule; the
 * function signature stays the same so the dashboard widget is unaffected.
 *
 * Gated by entitlements.analytics (Premium) at the route/UI boundary.
 */

import { prisma } from "./db.js";
import type { EventKind } from "./types.js";

export interface DashboardMetrics {
  range: { from: string; to: string; days: number };
  totals: Record<EventKind, number>;
  rates: {
    /** submitted / started */
    completionRate: number;
    /** abandoned / started */
    abandonRate: number;
    /** accepted / submitted */
    conversionRate: number;
  };
  popularConfigs: { dockType: string; count: number }[];
}

const ZERO_TOTALS: Record<EventKind, number> = {
  configurator_view: 0,
  design_started: 0,
  design_submitted: 0,
  lead_abandoned: 0,
  quote_sent: 0,
  lead_accepted: 0,
};

const ratio = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 1000 : 0);

export async function getDashboardMetrics(
  tenantId: string,
  opts: { days?: number; now?: Date } = {},
): Promise<DashboardMetrics> {
  const days = opts.days ?? 30;
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Tenant-scoped counts grouped by kind (indexed on tenantId, kind, at).
  const grouped = await prisma.event.groupBy({
    by: ["kind"],
    where: { tenantId, at: { gte: from, lte: now } },
    _count: { _all: true },
  });

  const totals: Record<EventKind, number> = { ...ZERO_TOTALS };
  for (const g of grouped) {
    if (g.kind in totals) totals[g.kind as EventKind] = g._count._all;
  }

  // Most-popular configs from design_started meta.dockType.
  const started = await prisma.event.findMany({
    where: { tenantId, kind: "design_started", at: { gte: from, lte: now } },
    select: { meta: true },
  });
  const byDock = new Map<string, number>();
  for (const e of started) {
    const dockType = (e.meta as { dockType?: string } | null)?.dockType;
    if (dockType) byDock.set(dockType, (byDock.get(dockType) ?? 0) + 1);
  }
  const popularConfigs = [...byDock.entries()]
    .map(([dockType, count]) => ({ dockType, count }))
    .sort((a, b) => b.count - a.count);

  return {
    range: { from: from.toISOString(), to: now.toISOString(), days },
    totals,
    rates: {
      completionRate: ratio(totals.design_submitted, totals.design_started),
      abandonRate: ratio(totals.lead_abandoned, totals.design_started),
      conversionRate: ratio(totals.lead_accepted, totals.design_submitted),
    },
    popularConfigs,
  };
}
