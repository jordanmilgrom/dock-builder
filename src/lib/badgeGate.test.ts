import { describe, expect, it } from "vitest";
import { shouldShowBadge } from "@/lib/badgeGate";
import { entitlementsForTier } from "@/lib/entitlements";

describe("'Powered by' badge gate (§10 #2 white-label)", () => {
  it("hides the badge for a Premium tenant that has toggled it off", () => {
    expect(shouldShowBadge(entitlementsForTier("premium"), { removeBadge: true })).toBe(false);
  });

  it("hides the badge for a Pro tenant that has toggled it off", () => {
    expect(shouldShowBadge(entitlementsForTier("pro"), { removeBadge: true })).toBe(false);
  });

  it("shows the badge for an entitled tenant that has NOT toggled it off", () => {
    expect(shouldShowBadge(entitlementsForTier("premium"), { removeBadge: false })).toBe(true);
  });

  it("ALWAYS shows the badge for a Starter tenant, regardless of branding setting", () => {
    expect(shouldShowBadge(entitlementsForTier("starter"), { removeBadge: true })).toBe(true);
    expect(shouldShowBadge(entitlementsForTier("starter"), { removeBadge: false })).toBe(true);
  });

  it("shows the badge when there is no resolved tenant/branding", () => {
    expect(shouldShowBadge(null, null)).toBe(true);
    expect(shouldShowBadge(undefined, undefined)).toBe(true);
  });
});
