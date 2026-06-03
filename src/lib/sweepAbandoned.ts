import "server-only";
/**
 * Abandoned-lead sweep (§8 Phase 3 item 6). Scans every tenant's still-"started"
 * leads and flips those quiet past the tenant's `abandonedThresholdDays` to
 * `abandoned` (the persisted form of the §5.4 derived transition), then fires the
 * abandoned notification — gated on the Pro+ `abandonedFollowUp` entitlement.
 *
 * Invoked hourly by `/api/internal/sweep-abandoned` (cron). Pure of HTTP so it
 * is unit-testable (lib/sweepAbandoned.test.ts).
 */

import { prisma } from "./db.js";
import type { Entitlements } from "./entitlements.js";
import { isAbandoned } from "./leadStatus.js";
import { markAbandoned, notifyAbandoned } from "./leadService.js";
import { createTenantScope } from "./tenantScope.js";

export interface SweepResult {
  tenantsScanned: number;
  leadsScanned: number;
  abandoned: number;
  notified: number;
}

export async function runAbandonedSweep(now: Date = new Date()): Promise<SweepResult> {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, abandonedThresholdDays: true, entitlements: true },
  });

  let leadsScanned = 0;
  let abandoned = 0;
  let notified = 0;

  for (const t of tenants) {
    const scope = createTenantScope(t.id);
    const ent = t.entitlements as unknown as Entitlements;
    const started = await prisma.lead.findMany({ where: { tenantId: t.id, status: "started" } });
    for (const l of started) {
      leadsScanned += 1;
      if (!isAbandoned("started", l.lastActivityAt, t.abandonedThresholdDays, now)) continue;
      await markAbandoned(scope, l.id);
      await scope.recordEvent("lead_abandoned", { leadId: l.id });
      abandoned += 1;
      const lead = await scope.getLead(l.id);
      if (lead && (await notifyAbandoned(scope, lead, ent))) notified += 1;
    }
  }

  return { tenantsScanned: tenants.length, leadsScanned, abandoned, notified };
}
