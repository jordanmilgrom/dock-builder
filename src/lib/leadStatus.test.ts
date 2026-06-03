import { describe, expect, it } from "vitest";
import {
  Audience,
  LEAD_STATES,
  canTransition,
  deriveStatus,
  isAbandoned,
  leadStatusLabel,
  type LeadStatus,
} from "@/lib/leadStatus";

describe("lead state machine transitions (§5.4)", () => {
  it("allows the canonical forward path", () => {
    expect(canTransition("started", "submitted")).toBe(true);
    expect(canTransition("abandoned", "submitted")).toBe(true);
    expect(canTransition("submitted", "in_review")).toBe(true);
    expect(canTransition("in_review", "quoted")).toBe(true);
    expect(canTransition("quoted", "accepted")).toBe(true);
    expect(canTransition("quoted", "closed")).toBe(true);
  });

  it("rejects illegal jumps and backward moves", () => {
    expect(canTransition("started", "quoted")).toBe(false);
    expect(canTransition("submitted", "quoted")).toBe(false);
    expect(canTransition("quoted", "in_review")).toBe(false);
    expect(canTransition("accepted", "closed")).toBe(false);
    expect(canTransition("closed", "started")).toBe(false);
  });
});

describe("derived started → abandoned (§10 #7)", () => {
  const now = new Date("2026-06-10T00:00:00Z");

  it("is abandoned only when a started lead is quiet past the threshold", () => {
    const quiet = new Date("2026-06-06T00:00:00Z"); // 4 days ago
    const recent = new Date("2026-06-09T00:00:00Z"); // 1 day ago
    expect(isAbandoned("started", quiet, 3, now)).toBe(true);
    expect(isAbandoned("started", recent, 3, now)).toBe(false);
    // exactly at threshold (3 days) is not yet abandoned
    expect(isAbandoned("started", new Date("2026-06-07T00:00:00Z"), 3, now)).toBe(false);
  });

  it("honors a per-tenant threshold override", () => {
    const fiveDaysAgo = new Date("2026-06-05T00:00:00Z");
    expect(isAbandoned("started", fiveDaysAgo, 3, now)).toBe(true);
    expect(isAbandoned("started", fiveDaysAgo, 7, now)).toBe(false);
  });

  it("never derives abandoned from a non-started state", () => {
    const ancient = new Date("2026-01-01T00:00:00Z");
    for (const s of ["submitted", "in_review", "quoted", "accepted", "closed"] as LeadStatus[]) {
      expect(deriveStatus(s, ancient, 3, now)).toBe(s);
    }
    expect(deriveStatus("started", ancient, 3, now)).toBe("abandoned");
    expect(deriveStatus("started", now, 3, now)).toBe("started");
  });
});

describe("dual vocabulary (§5.4) — customer never sees Won/Lost", () => {
  it("maps every state for both audiences", () => {
    for (const s of LEAD_STATES) {
      expect(leadStatusLabel(s, "builder")).toBeTruthy();
      expect(leadStatusLabel(s, "customer")).toBeTruthy();
    }
  });

  it("customer copy contains no Won/Lost/Abandoned for ANY state", () => {
    const forbidden = /\b(won|lost|abandon)/i;
    for (const s of LEAD_STATES) {
      const customer = leadStatusLabel(s, "customer");
      expect(customer, `customer label for "${s}" leaks: "${customer}"`).not.toMatch(forbidden);
    }
  });

  it("builder copy uses Won/Lost for the end states (intended)", () => {
    expect(leadStatusLabel("accepted", "builder")).toMatch(/won/i);
    expect(leadStatusLabel("closed", "builder")).toMatch(/lost/i);
    // The customer sees the neutral versions.
    expect(leadStatusLabel("accepted", "customer")).toBe("Accepted");
    expect(leadStatusLabel("closed", "customer")).toBe("Closed");
    expect(leadStatusLabel("quoted", "customer")).toBe("Quote ready");
  });
});

// Type-level: Audience is exported and usable.
const _audiences: Audience[] = ["builder", "customer"];
void _audiences;
