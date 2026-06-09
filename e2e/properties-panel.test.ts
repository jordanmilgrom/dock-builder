/**
 * End-to-end properties-panel flow (Phase 7). Driven through the pure panel
 * helpers (no browser harness in this repo) plus a DB round-trip, proving that
 * stepper/typed edits produce a valid, persistable config and that the panel
 * source wires up the Selection/Design pill, the Phase 8 construction note, and
 * the delete action.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { DockConfig, DockPiece } from "@/engine";
import { resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { createDesignFromSite, evaluate, saveRevision } from "@/lib/designService";
import {
  clampDim,
  cycleRotation,
  dimFields,
  selectionPill,
  stepDim,
  stepPos,
} from "@/lib/propertiesPanel";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("properties panel flow", () => {
  beforeEach(resetDb);

  it("pill reflects selection state", () => {
    expect(selectionPill(null)).toBe("Design");
    expect(selectionPill(2)).toBe("Selection");
  });

  it("the panel exposes per-piece dimension fields by kind", () => {
    const rect: DockPiece = { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8 };
    const tri: DockPiece = { pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 };
    expect(dimFields(rect).map((f) => f.key)).toEqual(["lengthFt", "widthFt"]);
    expect(dimFields(tri).map((f) => f.key)).toEqual(["legAFt", "legBFt"]);
  });

  it("stepper + typed edits commit a valid resized/rotated design", async () => {
    const scope = await makeTenant("props-co", { tier: "pro" });
    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE, { dockType: "floating" });
    if ("error" in created) throw new Error("draft_cap");

    // Start from a single piece, then edit it the way the panel would.
    let piece: DockPiece = { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8 };
    piece = { ...piece, lengthFt: stepDim(piece.lengthFt!, 1) };   // +6 in → 20.5
    piece = { ...piece, widthFt: clampDim(8.3) };                  // typed → 8.5
    piece = { ...piece, posX: stepPos(piece.posX, 1) };            // +1 ft
    piece = { ...piece, rotationDeg: cycleRotation(piece.rotationDeg) }; // 0 → 90
    expect(piece).toMatchObject({ lengthFt: 20.5, widthFt: 8.5, posX: 1, rotationDeg: 90 });

    const next: DockConfig = { ...created.revision.config, pieces: [piece] };
    const rev = await saveRevision(scope, created.design.id, next, customer.id);
    expect(rev).toBeDefined();
    const evald = await evaluate(scope, next);
    expect(evald.validation.ok).toBe(true);
    expect(evald.estimate.total).toBeGreaterThan(0);
  });

  it("panel source wires the pill, construction note, and delete action", () => {
    const panel = readFileSync(resolve(ROOT, "src/components/PropertiesPanel.tsx"), "utf8");
    expect(panel).toContain("selectionPill");
    expect(panel).toContain("PieceProperties");
    expect(panel).toContain("DesignProperties");
    const piece = readFileSync(resolve(ROOT, "src/components/PieceProperties.tsx"), "utf8");
    expect(piece).toContain("Phase 8: per-piece floating / pile / wheel");
    expect(piece).toContain("Delete piece");
  });
});
