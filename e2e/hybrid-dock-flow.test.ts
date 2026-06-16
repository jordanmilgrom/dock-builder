/**
 * End-to-end hybrid dock (Phase 8): a customer draws a floating 20×8 + pile 16×8
 * + wheel 12×6 running out to shore. The engine lays out the right supports per
 * piece, the Canvas/Schematic/3D renderers all reflect them, the mixed-construction
 * transition advisories fire, and the branded PDF round-trips to a non-empty %PDF.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { DockConfig } from "@/engine";
import {
  floatCount,
  pilingCount,
  resolvePieces,
  suggestedFloatLayout,
  suggestedPileLayout,
  suggestedWheelLayout,
  wheelCount,
  planView,
} from "@/engine";
import { buildSceneSpec } from "@/lib/view3d";
import { resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { createDesignFromSite, evaluate, saveRevision } from "@/lib/designService";
import { buildDesignPdf } from "@/lib/pdf";

describe("hybrid dock customer flow", () => {
  beforeEach(resetDb);

  it("draws floating + pile + wheel, sees per-piece supports + transition advisories, exports a PDF", async () => {
    const scope = await makeTenant("hybrid-co", { tier: "pro" });
    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE, { dockType: "floating" });
    if ("error" in created) throw new Error("draft_cap");

    const hybrid: DockConfig = {
      ...created.revision.config,
      overall: { ...created.revision.config.overall, maxGapFt: 8 },
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, construction: "floating" },
        { pieceKind: "rectangle", posX: 20, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8, construction: "pile" },
        { pieceKind: "rectangle", posX: 36, posY: 0, rotationDeg: 0, lengthFt: 12, widthFt: 6, construction: "wheel" },
      ],
    };

    const rev = await saveRevision(scope, created.design.id, hybrid, customer.id);
    expect(rev).toBeDefined();

    // Engine resolves three pieces, one per construction.
    expect(resolvePieces(hybrid).map((p) => p.constructions)).toEqual([["floating"], ["pile"], ["wheel"]]);

    // Supports counted per construction.
    expect(floatCount(hybrid)).toBe(8);
    expect(pilingCount(hybrid)).toBe(6);
    expect(wheelCount(hybrid)).toBe(2);
    expect(suggestedFloatLayout(hybrid)).toHaveLength(8);
    expect(suggestedPileLayout(hybrid)).toHaveLength(6);
    expect(suggestedWheelLayout(hybrid)).toHaveLength(2);

    // Schematic (plan) renders circles for every support symbol.
    const plan = planView(hybrid);
    expect(plan.shapes.some((s) => s.kind === "circle")).toBe(true);

    // 3D scene carries floats, piles, and two wheel cylinders + brackets.
    const spec = buildSceneSpec(hybrid);
    expect(spec.boxes.some((b) => b.kind === "float")).toBe(true);
    expect(spec.boxes.some((b) => b.kind === "pile")).toBe(true);
    expect(spec.boxes.filter((b) => b.kind === "wheel")).toHaveLength(2);
    expect(spec.boxes.some((b) => b.kind === "bracket")).toBe(true);

    // Mixed-construction transition advisories (floating→pile, pile→wheel).
    const evald = await evaluate(scope, hybrid);
    const warnCodes = evald.validation.warnings.map((w) => w.code);
    expect(warnCodes.filter((c) => c === "mixed_construction_adjacency").length).toBeGreaterThanOrEqual(1);
    expect(evald.validation.ok).toBe(true);
    expect(evald.estimate.total).toBeGreaterThan(0);

    // Branded PDF round-trip.
    const branding = await scope.getBranding();
    const head = (await scope.getRevision((await scope.getDesign(created.design.id))!.currentRevisionId))!;
    const pdf = await buildDesignPdf({ branding: branding!, revision: head, projectName: created.design.name, customerEmail: "buyer@hybrid.test" });
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
