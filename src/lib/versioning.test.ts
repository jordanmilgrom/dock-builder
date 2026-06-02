import { describe, expect, it } from "vitest";
import { generateStartingDesign, type DockConfig } from "@/engine";
import {
  DRAFT_CAP,
  buildRevision,
  canCreateDraft,
  summarizeConfigChange,
} from "./versioning.js";

const site = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 1.5,
  bottom: "sand" as const,
  waveExposure: "inland_lake" as const,
  seasonalIce: false,
  shoreHeightAboveWaterFt: 3,
};

function design(): DockConfig {
  return generateStartingDesign(site, { tenantId: "dev" });
}

describe("draft cap (§5.4)", () => {
  it("caps drafts at 3", () => {
    expect(DRAFT_CAP).toBe(3);
    expect(canCreateDraft(0)).toBe(true);
    expect(canCreateDraft(2)).toBe(true);
    expect(canCreateDraft(3)).toBe(false);
  });
});

describe("buildRevision (immutable snapshots, §5.5)", () => {
  it("increments version from the previous revision", () => {
    const v1 = buildRevision({ designId: "d1", previous: null, config: design(), estimate: null, authorRole: "customer", authorId: "c1" });
    const v2 = buildRevision({ designId: "d1", previous: v1, config: design(), estimate: null, authorRole: "customer", authorId: "c1" });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v1.changeSummary).toBe("Initial design");
  });

  it("snapshots a deep copy — later edits to the source config don't mutate it", () => {
    const cfg = design();
    const rev = buildRevision({ designId: "d1", previous: null, config: cfg, estimate: null, authorRole: "customer", authorId: "c1" });
    cfg.overall.lengthFt = 999;
    expect(rev.config.overall.lengthFt).not.toBe(999);
  });

  it("honors an explicit changeSummary (restore/branch)", () => {
    const rev = buildRevision({ designId: "d1", previous: null, config: design(), estimate: null, authorRole: "customer", authorId: "c1", changeSummary: "Restored v2" });
    expect(rev.changeSummary).toBe("Restored v2");
  });
});

describe("summarizeConfigChange", () => {
  it("describes dimension, material, and accessory changes", () => {
    const a = design();
    const b = design();
    b.overall.lengthFt = a.overall.lengthFt + 8;
    b.overall.deckingMaterial = "pvc";
    b.accessories = [{ type: "ladder", qty: 1 }, { type: "bench", qty: 1 }];
    a.accessories = [{ type: "ladder", qty: 1 }];
    const s = summarizeConfigChange(a, b);
    expect(s).toMatch(/length/i);
    expect(s).toMatch(/decking/i);
    expect(s).toMatch(/added bench/i);
  });

  it("reports no structural change when configs match", () => {
    expect(summarizeConfigChange(design(), design())).toBe("No structural change");
  });

  it("labels the first revision as the initial design", () => {
    expect(summarizeConfigChange(null, design())).toBe("Initial design");
  });
});
