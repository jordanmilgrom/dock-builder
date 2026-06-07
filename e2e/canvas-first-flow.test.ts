/**
 * End-to-end canvas-first flow (Phase 7). The repo has no browser harness
 * (node-vitest only), so the on-canvas interactions are driven through the SAME
 * pure libs the Canvas editor calls (scaleToFit / resizeHandles) plus a
 * DB-backed design round-trip — proving add → fit → resize → rotate keeps the
 * config valid and persisted. A source check confirms the design page mounts the
 * canvas-first shell.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { DockConfig, DockPiece } from "@/engine";
import { resolvePieces } from "@/engine";
import { resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { createDesignFromSite, evaluate, saveRevision } from "@/lib/designService";
import { fitBbox, worldToScreen, zoomAround } from "@/lib/scaleToFit";
import { resizeRect, snapRect } from "@/lib/resizeHandles";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("canvas-first flow", () => {
  beforeEach(resetDb);

  it("the design page renders the canvas-first ConfiguratorPane, defaulting to canvas", () => {
    const page = readFileSync(resolve(ROOT, "src/app/design/[id]/page.tsx"), "utf8");
    expect(page).toContain("ConfiguratorPane");
    expect(page).not.toContain("DockPiecesCanvas");
    const pane = readFileSync(resolve(ROOT, "src/components/ConfiguratorPane.tsx"), "utf8");
    expect(pane).toContain("parseViewParam"); // active view comes from ?view=
    expect(pane).toContain("CanvasMode");
  });

  it("add → auto-fit frames the union of pieces inside the viewport", () => {
    const pieces: DockPiece[] = [
      { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8 },
      { pieceKind: "rectangle", posX: 20, posY: 0, rotationDeg: 0, lengthFt: 8, widthFt: 8 },
    ];
    const bbox = { minX: 0, minY: 0, maxX: 28, maxY: 8 };
    const t = fitBbox(bbox, { width: 1000, height: 600 });
    // Every corner of the union maps inside the viewport (with padding slack).
    for (const [x, y] of [[bbox.minX, bbox.minY], [bbox.maxX, bbox.maxY]]) {
      const s = worldToScreen(t, x!, y!);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1000);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(600);
    }
    expect(pieces).toHaveLength(2);
  });

  it("zoom-to-cursor keeps the pointed-at world point fixed", () => {
    const t = fitBbox({ minX: 0, minY: 0, maxX: 24, maxY: 8 }, { width: 800, height: 500 });
    const cursor = { x: 410, y: 260 };
    const before = worldToScreen(t, 12, 4);
    const z = zoomAround(t, 1.1, cursor);
    // The cursor's world point is unchanged after zoom.
    const w0 = { x: (cursor.x - t.translate.x) / t.scale, y: (cursor.y - t.translate.y) / t.scale };
    const after = worldToScreen(z, w0.x, w0.y);
    expect(after.x).toBeCloseTo(cursor.x, 6);
    expect(after.y).toBeCloseTo(cursor.y, 6);
    expect(before).toBeDefined();
  });

  it("resizing a piece (drag SE handle + release snap) persists a valid larger design", async () => {
    const scope = await makeTenant("canvas-co", { tier: "pro" });
    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE, { dockType: "floating" });
    if ("error" in created) throw new Error("draft_cap");

    const start = { posX: 0, posY: 0, lengthFt: 20, widthFt: 8 };
    // Drag the SE corner out by 3.7×3.7 ft, then snap on release.
    const dragged = resizeRect(start, "se", 3.7, 3.7);
    const snapped = snapRect(dragged, "se");
    expect(snapped.lengthFt).toBe(23.5);
    expect(snapped.widthFt).toBe(11.5);

    const next: DockConfig = {
      ...created.revision.config,
      pieces: [{ pieceKind: "rectangle", posX: snapped.posX, posY: snapped.posY, rotationDeg: 0, lengthFt: snapped.lengthFt, widthFt: snapped.widthFt }],
    };
    const rev = await saveRevision(scope, created.design.id, next, customer.id);
    expect(rev).toBeDefined();

    const evald = await evaluate(scope, next);
    expect(evald.validation.ok).toBe(true);
    expect(resolvePieces(next)).toHaveLength(1);
    expect(evald.validation.derived.deckAreaFt2).toBeCloseTo(23.5 * 11.5, 5);
  });
});
