/**
 * End-to-end multi-piece flow (Phase 6): a customer draws an L-shape (8×20 +
 * 8×8), the engine lays out floats + piles per piece, and the branded PDF
 * round-trips to a non-empty %PDF.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { DockConfig } from "@/engine";
import { floatLayoutForPiece, resolvePieces, suggestedFloatLayout } from "@/engine";
import { resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { createDesignFromSite, evaluate, saveRevision } from "@/lib/designService";
import { buildDesignPdf } from "@/lib/pdf";

describe("multi-piece customer flow", () => {
  beforeEach(resetDb);

  it("draws an L-shape, lays out floats/piles per piece, and round-trips a PDF", async () => {
    const scope = await makeTenant("lshape-co", { tier: "pro" });
    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE, { dockType: "floating" });
    if ("error" in created) throw new Error("draft_cap");

    // The customer draws an L: a 20×8 spine plus an 8×8 ell off the end.
    const lConfig: DockConfig = {
      ...created.revision.config,
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8 },
        { pieceKind: "rectangle", posX: 20, posY: 0, rotationDeg: 0, lengthFt: 8, widthFt: 8 },
      ],
    };

    const v2 = await saveRevision(scope, created.design.id, lConfig, customer.id);
    expect(v2).toBeDefined();

    // Engine sees two pieces and lays floats out on each.
    const pieces = resolvePieces(lConfig);
    expect(pieces).toHaveLength(2);
    const spineFloats = floatLayoutForPiece(pieces[0]!);
    const ellFloats = floatLayoutForPiece(pieces[1]!);
    expect(spineFloats.length).toBeGreaterThan(0);
    expect(ellFloats.length).toBeGreaterThan(0);
    // Aggregate equals the sum across pieces.
    expect(suggestedFloatLayout(lConfig)).toHaveLength(spineFloats.length + ellFloats.length);

    // Live evaluate: validates clean with a positive estimate.
    const evald = await evaluate(scope, lConfig);
    expect(evald.validation.ok).toBe(true);
    expect(evald.estimate.total).toBeGreaterThan(0);
    expect(evald.validation.derived.deckAreaFt2).toBe(20 * 8 + 8 * 8);

    // Branded PDF round-trip.
    const branding = await scope.getBranding();
    const head = (await scope.getRevision((await scope.getDesign(created.design.id))!.currentRevisionId))!;
    const pdf = await buildDesignPdf({ branding: branding!, revision: head, projectName: created.design.name, customerEmail: "buyer@l.test" });
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
