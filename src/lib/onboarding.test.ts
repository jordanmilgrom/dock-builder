import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb } from "@/test/db";
import { signUpBuilder } from "@/lib/onboarding";
import { entitlementsForTier } from "@/lib/entitlements";
import { DOCK_TYPES } from "@/lib/seed";

describe("builder self-serve onboarding", () => {
  beforeEach(resetDb);

  it("signup → tenant → catalog clone → branding → trial (happy path)", async () => {
    const res = await signUpBuilder({
      email: "Owner@HarborWorks.com",
      tenantName: "Harbor Works",
      slug: "harbor-works",
      brand: { primaryColor: "#114488" },
    });
    expect("error" in res).toBe(false);
    if ("error" in res) return;

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: res.tenantId },
      include: {
        branding: true,
        pricingProfiles: { include: { items: true } },
        floatProducts: true,
        deckingProducts: true,
        accessoryProducts: true,
        users: true,
      },
    });

    // Tenant + trial.
    expect(tenant.slug).toBe("harbor-works");
    expect(tenant.tier).toBe("starter");
    expect(tenant.subscriptionStatus).toBe("trialing");
    expect(tenant.trialEndsAt).toBeTruthy();
    expect(tenant.leadCap).toBe(100);
    expect(tenant.entitlements).toEqual(entitlementsForTier("starter"));

    // Branding cloned with override + badge ON for Starter.
    expect(tenant.branding?.name).toBe("Harbor Works");
    expect(tenant.branding?.primaryColor).toBe("#114488");
    expect(tenant.branding?.removeBadge).toBe(false);

    // Catalog cloned: one pricing profile per dock type, each with items.
    expect(tenant.pricingProfiles).toHaveLength(DOCK_TYPES.length);
    for (const p of tenant.pricingProfiles) expect(p.items.length).toBeGreaterThan(0);
    expect(tenant.floatProducts.length).toBeGreaterThan(0);
    expect(tenant.deckingProducts.length).toBeGreaterThan(0);
    expect(tenant.accessoryProducts.length).toBeGreaterThan(0);

    // Builder admin user created (email normalized, magic-link only — no password column).
    expect(tenant.users).toHaveLength(1);
    expect(tenant.users[0]!.email).toBe("owner@harborworks.com");
    expect(tenant.users[0]!.role).toBe("builder_admin");
  });

  it("rejects invalid email, bad slug, reserved slug, and duplicates", async () => {
    expect(await signUpBuilder({ email: "nope", tenantName: "X", slug: "x-co" })).toEqual({ error: "invalid_email" });
    expect(await signUpBuilder({ email: "a@b.com", tenantName: "X", slug: "Bad Slug!" })).toEqual({ error: "invalid_slug" });
    expect(await signUpBuilder({ email: "a@b.com", tenantName: "X", slug: "admin" })).toEqual({ error: "reserved_slug" });

    const ok = await signUpBuilder({ email: "a@b.com", tenantName: "First", slug: "dup-co" });
    expect("error" in ok).toBe(false);
    expect(await signUpBuilder({ email: "c@d.com", tenantName: "Second", slug: "dup-co" })).toEqual({ error: "slug_taken" });
  });

  it("isolates catalogs per tenant (no shared rows)", async () => {
    const r1 = await signUpBuilder({ email: "a@one.com", tenantName: "One", slug: "tenant-one" });
    const r2 = await signUpBuilder({ email: "b@two.com", tenantName: "Two", slug: "tenant-two" });
    if ("error" in r1 || "error" in r2) throw new Error("setup failed");

    const p1 = await prisma.pricingProfile.findMany({ where: { tenantId: r1.tenantId } });
    const p2 = await prisma.pricingProfile.findMany({ where: { tenantId: r2.tenantId } });
    expect(p1.length).toBe(DOCK_TYPES.length);
    expect(p2.length).toBe(DOCK_TYPES.length);
    expect(new Set(p1.map((p) => p.id)).size).toBe(p1.length);
    // No id overlap between tenants.
    const overlap = p1.filter((p) => p2.some((q) => q.id === p.id));
    expect(overlap).toHaveLength(0);
  });
});
