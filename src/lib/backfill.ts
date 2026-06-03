import "server-only";
/**
 * Tested backfill for the Phase 3 lead state machine (§8 migration). The SQL
 * migration seeds status from submittedAt for existing rows; this idempotent
 * function is the programmatic equivalent (safe to re-run, won't downgrade an
 * already-advanced lead). Exposed for the seed/ops scripts and tested directly.
 */

import { prisma } from "./db.js";
import { LEAD_STATES } from "./leadStatus.js";

export async function backfillLeadStatuses(): Promise<{ updated: number }> {
  const leads = await prisma.lead.findMany({ select: { id: true, status: true, submittedAt: true } });
  let updated = 0;
  for (const l of leads) {
    let desired = l.status;
    if (!LEAD_STATES.includes(l.status as (typeof LEAD_STATES)[number])) {
      // Unknown/legacy value: started unless it was submitted.
      desired = l.submittedAt ? "submitted" : "started";
    } else if (l.status === "started" && l.submittedAt) {
      desired = "submitted";
    }
    if (desired !== l.status) {
      await prisma.lead.update({ where: { id: l.id }, data: { status: desired } });
      updated += 1;
    }
  }
  return { updated };
}
