import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, resetDb, makeTenant } from "@/test/db";
import {
  resolveByCustomDomain,
  setCustomDomain,
  txtRecordName,
  verifyCustomDomain,
} from "@/lib/customDomain";

describe("custom domain (§5.7)", () => {
  beforeEach(resetDb);

  it("middleware-style lookup resolves a verified domain to its tenant only", async () => {
    const scope = await makeTenant("acme-domains", { tier: "premium" });
    const setup = await setCustomDomain(scope.tenantId, "design.acmedocks.com");
    if ("error" in setup) throw new Error(setup.error);

    // Before verification → unverified (placeholder), never resolves to the tenant.
    let res = await resolveByCustomDomain("design.acmedocks.com");
    expect(res.kind).toBe("unverified");

    // Verify with a DNS stub returning the TXT token.
    const resolveTxt = vi.fn(async (name: string) => {
      expect(name).toBe(txtRecordName("design.acmedocks.com"));
      return [[setup.txtValue]];
    });
    const v = await verifyCustomDomain(scope.tenantId, { resolveTxt });
    expect(v.verified).toBe(true);
    expect(resolveTxt).toHaveBeenCalledOnce();

    res = await resolveByCustomDomain("design.acmedocks.com");
    expect(res).toMatchObject({ kind: "verified", tenantId: scope.tenantId });
  });

  it("does not verify when the TXT token is absent/mismatched", async () => {
    const scope = await makeTenant("mismatch-co", { tier: "premium" });
    await setCustomDomain(scope.tenantId, "dock.example.com");
    const v = await verifyCustomDomain(scope.tenantId, { resolveTxt: async () => [["some-other-value"]] });
    expect(v.verified).toBe(false);
    expect((await resolveByCustomDomain("dock.example.com")).kind).toBe("unverified");
  });

  it("unknown host resolves to none; lookup is an O(1) indexed unique read", async () => {
    expect((await resolveByCustomDomain("nobody.example.com")).kind).toBe("none");
    // The column backing the lookup is unique (one tenant per domain).
    const scope = await makeTenant("idx-co", { tier: "premium" });
    await setCustomDomain(scope.tenantId, "x.example.com");
    const row = await prisma.tenant.findUnique({ where: { customDomain: "x.example.com" } });
    expect(row?.id).toBe(scope.tenantId);
  });

  it("rejects invalid hostnames", async () => {
    const scope = await makeTenant("bad-host", { tier: "premium" });
    expect(await setCustomDomain(scope.tenantId, "not a domain")).toEqual({ error: "invalid_hostname" });
  });
});
