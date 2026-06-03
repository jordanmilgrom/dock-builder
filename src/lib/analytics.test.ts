import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeTenant } from "@/test/db";
import { getDashboardMetrics } from "@/lib/analytics";

describe("analytics roll-ups (§5.6)", () => {
  beforeEach(resetDb);

  it("aggregates totals, rates, and popular configs within tenant scope", async () => {
    const a = await makeTenant("metrics-a", { tier: "premium" });
    const b = await makeTenant("metrics-b", { tier: "premium" });

    // Tenant A: 10 views, 4 started (3 floating, 1 pile), 2 submitted, 1 abandoned, 1 accepted.
    for (let i = 0; i < 10; i++) await a.recordEvent("configurator_view");
    for (let i = 0; i < 3; i++) await a.recordEvent("design_started", { dockType: "floating" });
    await a.recordEvent("design_started", { dockType: "pile" });
    await a.recordEvent("design_submitted");
    await a.recordEvent("design_submitted");
    await a.recordEvent("lead_abandoned");
    await a.recordEvent("lead_accepted");

    // Tenant B noise that must NOT leak into A's metrics.
    for (let i = 0; i < 5; i++) await b.recordEvent("configurator_view");
    await b.recordEvent("design_started", { dockType: "crib" });

    const m = await getDashboardMetrics(a.tenantId);
    expect(m.totals.configurator_view).toBe(10);
    expect(m.totals.design_started).toBe(4);
    expect(m.totals.design_submitted).toBe(2);
    expect(m.totals.lead_abandoned).toBe(1);
    expect(m.totals.lead_accepted).toBe(1);

    expect(m.rates.completionRate).toBe(0.5); // 2/4
    expect(m.rates.abandonRate).toBe(0.25); // 1/4
    expect(m.rates.conversionRate).toBe(0.5); // 1/2

    expect(m.popularConfigs[0]).toEqual({ dockType: "floating", count: 3 });
    expect(m.popularConfigs.find((p) => p.dockType === "crib")).toBeUndefined();
  });

  it("handles an empty tenant without dividing by zero", async () => {
    const a = await makeTenant("metrics-empty", { tier: "premium" });
    const m = await getDashboardMetrics(a.tenantId);
    expect(m.totals.design_started).toBe(0);
    expect(m.rates.completionRate).toBe(0);
    expect(m.popularConfigs).toEqual([]);
  });
});
