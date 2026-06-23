import { describe, expect, it } from "vitest";
import { matchShortcut, SHORTCUT_HINT } from "@/lib/canvasShortcuts";

describe("canvasShortcuts", () => {
  it("maps each binding to its action", () => {
    expect(matchShortcut({ key: "c", metaKey: true })).toBe("copy");
    expect(matchShortcut({ key: "v", metaKey: true })).toBe("paste");
    expect(matchShortcut({ key: "d", metaKey: true })).toBe("duplicate");
    expect(matchShortcut({ key: "a", metaKey: true })).toBe("selectAll");
    expect(matchShortcut({ key: "z", metaKey: true })).toBe("undo");
    expect(matchShortcut({ key: "z", metaKey: true, shiftKey: true })).toBe("redo");
    expect(matchShortcut({ key: "Delete" })).toBe("delete");
    expect(matchShortcut({ key: "Backspace" })).toBe("delete");
    expect(matchShortcut({ key: "Escape" })).toBe("deselect");
    expect(matchShortcut({ key: "f" })).toBe("fit");
  });

  it("Ctrl is treated like Cmd (Windows/Linux)", () => {
    expect(matchShortcut({ key: "z", ctrlKey: true })).toBe("undo");
  });

  it("plain letters (no modifier) are not shortcuts", () => {
    expect(matchShortcut({ key: "c" })).toBeNull();
    expect(matchShortcut({ key: "a" })).toBeNull();
  });

  it("exposes a hint for every action", () => {
    expect(SHORTCUT_HINT.duplicate).toBe("⌘D");
    expect(SHORTCUT_HINT.delete).toBe("Del");
  });
});
