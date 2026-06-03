import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { createDesignFromSite } from "@/lib/designService";
import { enforceLeadCreation, resetRateLimits, checkRateLimit } from "@/lib/rateLimit";

describe("abuse controls (§5.8)", () => {
  describe("3-draft cap per (tenant, customer) at the service boundary", () => {
    beforeEach(resetDb);

    it("allows 3 drafts then rejects the 4th", async () => {
      const scope = await makeTenant("cap-co");
      const customer = await scope.createAnonymousCustomer();
      for (let i = 0; i < 3; i++) {
        const r = await createDesignFromSite(scope, customer.id, SAMPLE_SITE);
        expect("error" in r).toBe(false);
      }
      const fourth = await createDesignFromSite(scope, customer.id, SAMPLE_SITE);
      expect(fourth).toEqual({ error: "draft_cap" });
      expect(await scope.countDrafts(customer.id)).toBe(3);
    });

    it("the cap is per customer, not global to the tenant", async () => {
      const scope = await makeTenant("cap-co-2");
      const a = await scope.createAnonymousCustomer();
      const b = await scope.createAnonymousCustomer();
      for (let i = 0; i < 3; i++) await createDesignFromSite(scope, a.id, SAMPLE_SITE);
      // b is unaffected by a hitting the cap.
      const r = await createDesignFromSite(scope, b.id, SAMPLE_SITE);
      expect("error" in r).toBe(false);
    });
  });

  describe("lead-creation rate limiting (30/min/IP, 200/hour/tenant)", () => {
    beforeEach(resetRateLimits);

    it("blocks the 31st lead from one IP within a minute", () => {
      const now = 1_000_000;
      for (let i = 0; i < 30; i++) {
        expect(enforceLeadCreation("1.2.3.4", "t_a", now)).toEqual({ ok: true });
      }
      expect(enforceLeadCreation("1.2.3.4", "t_a", now)).toEqual({ ok: false, scope: "ip" });
      // A different IP is unaffected.
      expect(enforceLeadCreation("5.6.7.8", "t_a", now)).toEqual({ ok: true });
      // The window resets after 60s.
      expect(enforceLeadCreation("1.2.3.4", "t_a", now + 60_001)).toEqual({ ok: true });
    });

    it("blocks the 201st lead per tenant within an hour (across IPs)", () => {
      const now = 2_000_000;
      // Spread across many IPs so the per-IP limit never trips first.
      for (let i = 0; i < 200; i++) {
        expect(enforceLeadCreation(`ip-${i}`, "t_b", now)).toEqual({ ok: true });
      }
      expect(enforceLeadCreation("ip-new", "t_b", now)).toEqual({ ok: false, scope: "tenant" });
    });

    it("checkRateLimit reports remaining + reset", () => {
      const d = checkRateLimit("k", 2, 1000, 0);
      expect(d).toMatchObject({ allowed: true, remaining: 1, resetAt: 1000 });
    });
  });
});
