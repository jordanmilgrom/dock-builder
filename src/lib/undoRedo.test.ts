import { describe, expect, it } from "vitest";
import { createHistory } from "@/lib/undoRedo";

describe("undoRedo", () => {
  it("undo restores the previous snapshot; redo restores forward", () => {
    const h = createHistory<number>();
    h.push(1, 1000);
    h.push(2, 2000);
    h.push(3, 3000);
    expect(h.undo()).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.canUndo()).toBe(false);
    expect(h.redo()).toBe(2);
    expect(h.redo()).toBe(3);
  });

  it("coalesces consecutive edits within 500 ms into one entry", () => {
    const h = createHistory<number>();
    h.push(0, 0); // baseline
    h.push(1, 100);
    h.push(2, 300); // within 500 ms of the previous → replaces it
    h.push(3, 600); // 300 ms after #2 → still coalesces
    // One coalesced entry on top of the baseline → a single undo returns baseline.
    expect(h.undo()).toBe(0);
    expect(h.canUndo()).toBe(false);
  });

  it("a slow edit (>500 ms) is its own entry", () => {
    const h = createHistory<number>();
    h.push(0, 0);
    h.push(1, 100);
    h.push(2, 2000); // >500 ms later → separate entry
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
  });

  it("a new push clears the redo stack", () => {
    const h = createHistory<number>();
    h.push(1, 0);
    h.push(2, 1000);
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.push(9, 5000);
    expect(h.canRedo()).toBe(false);
  });

  it("caps at 50 entries (ring buffer)", () => {
    const h = createHistory<number>();
    for (let i = 0; i < 80; i++) h.push(i, i * 1000); // 1s apart → no coalesce
    expect(h.size()).toBe(50);
  });

  it("clear resets everything (called on save)", () => {
    const h = createHistory<number>();
    h.push(1, 0);
    h.push(2, 1000);
    h.clear();
    expect(h.size()).toBe(0);
    expect(h.canUndo()).toBe(false);
  });
});
