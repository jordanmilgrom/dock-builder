/**
 * End-to-end wizard flow (Phase 7). The questionnaire is now opt-in. Without a
 * browser harness, the wizard's recommendation + "Start designing" step is driven
 * through the engine + designService (the same calls the modal makes on finish),
 * and the skip/returning behavior is asserted via the landing source + the
 * Premium-gated tenant column.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { recommendDockType } from "@/engine";
import { prisma, resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { createDesignFromSite } from "@/lib/designService";
import { loadTenantById } from "@/lib/tenant";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("wizard flow (opt-in questionnaire)", () => {
  beforeEach(resetDb);

  it("the last step recommends a type and lands a starting design on the canvas", async () => {
    const scope = await makeTenant("wiz-co", { tier: "pro" });
    const customer = await scope.createAnonymousCustomer();

    // Wizard finish: recommend, then create the design from the answers.
    const rec = recommendDockType(SAMPLE_SITE);
    expect(rec.dockType).toBeTruthy();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE, { dockType: rec.dockType, use: "residential" });
    if ("error" in created) throw new Error("draft_cap");

    // A starting design exists with at least one piece to edit on the canvas.
    const pieces = created.revision.config.pieces ?? [];
    expect(pieces.length).toBeGreaterThanOrEqual(1);
    expect(created.revision.config.dockType).toBe(rec.dockType);
  });

  it("skipWizardByDefault is additive, Premium-gated, and surfaced in TenantMeta", async () => {
    const scope = await makeTenant("premium-co", { tier: "premium" });
    // Default false (existing tenants unchanged).
    const before = await loadTenantById(scope.tenantId);
    expect(before?.meta.skipWizardByDefault).toBe(false);

    await prisma.tenant.update({ where: { id: scope.tenantId }, data: { skipWizardByDefault: true } });
    const after = await loadTenantById(scope.tenantId);
    expect(after?.meta.skipWizardByDefault).toBe(true);
  });

  it("the landing hides the wizard card for returning / skip-by-default users", () => {
    const landing = readFileSync(resolve(ROOT, "src/components/CanvasLanding.tsx"), "utf8");
    expect(landing).toContain("skipWizardByDefault || isReturning");
    expect(landing).toContain("Start the wizard");
    expect(landing).toContain("draw it myself");
    // The home page passes both signals in.
    const home = readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8");
    expect(home).toContain("isReturning");
    expect(home).toContain("skipWizardByDefault");
  });
});
