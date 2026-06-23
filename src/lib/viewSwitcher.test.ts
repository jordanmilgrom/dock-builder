import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  isViewMode,
  parseViewParam,
  VIEW_LABELS,
  VIEW_MODES,
  viewSearchString,
} from "@/lib/viewSwitcher";

describe("parseViewParam", () => {
  it("defaults to canvas when missing/unknown", () => {
    expect(parseViewParam(null)).toBe("canvas");
    expect(parseViewParam(undefined)).toBe("canvas");
    expect(parseViewParam("")).toBe("canvas");
    expect(parseViewParam("bogus")).toBe("canvas");
    expect(DEFAULT_VIEW).toBe("canvas");
  });

  it("accepts the three real modes", () => {
    expect(parseViewParam("canvas")).toBe("canvas");
    expect(parseViewParam("schematic")).toBe("schematic");
    expect(parseViewParam("3d")).toBe("3d");
  });
});

describe("isViewMode", () => {
  it("type-guards the union", () => {
    expect(isViewMode("3d")).toBe(true);
    expect(isViewMode("x")).toBe(false);
    expect(isViewMode(null)).toBe(false);
  });
});

describe("viewSearchString", () => {
  it("drops the param for the default (clean canvas URL)", () => {
    expect(viewSearchString("canvas")).toBe("");
    expect(viewSearchString("canvas", "?view=3d")).toBe("");
  });

  it("sets view for non-default modes", () => {
    expect(viewSearchString("schematic")).toBe("?view=schematic");
    expect(viewSearchString("3d")).toBe("?view=3d");
  });

  it("preserves other query params", () => {
    expect(viewSearchString("3d", "?foo=1")).toBe("?foo=1&view=3d");
    expect(viewSearchString("canvas", "foo=1&view=schematic")).toBe("?foo=1");
  });
});

describe("catalog", () => {
  it("has a label for every mode", () => {
    expect(VIEW_MODES).toEqual(["canvas", "site", "schematic", "3d"]);
    for (const m of VIEW_MODES) expect(VIEW_LABELS[m]).toBeTruthy();
  });
});
