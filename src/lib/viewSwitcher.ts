/**
 * View-switcher state (Phase 7). Pure helpers for the Canvas/Schematic/3D tab
 * bar, with the active tab persisted in the URL (`?view=`). Default is Canvas.
 * No React here — the component reads/writes the query string through these.
 */

export type ViewMode = "canvas" | "site" | "schematic" | "3d";

// Phase 11: the Site (bathymetry) tab sits between Canvas and Schematic.
export const VIEW_MODES: ViewMode[] = ["canvas", "site", "schematic", "3d"];

export const VIEW_LABELS: Record<ViewMode, string> = {
  canvas: "Canvas",
  site: "Site",
  schematic: "Schematic",
  "3d": "3D",
};

export const DEFAULT_VIEW: ViewMode = "canvas";

export function isViewMode(s: string | null | undefined): s is ViewMode {
  return s === "canvas" || s === "site" || s === "schematic" || s === "3d";
}

/** Parse `?view=` (any source), falling back to Canvas for missing/unknown. */
export function parseViewParam(raw: string | null | undefined): ViewMode {
  return isViewMode(raw) ? raw : DEFAULT_VIEW;
}

/**
 * Serialize a view selection into a query string for navigation. Canvas (the
 * default) drops the param to keep clean URLs; others set `view=<mode>`.
 * `current` may be an existing search string ("a=1" or "?a=1") whose other
 * params are preserved.
 */
export function viewSearchString(mode: ViewMode, current = ""): string {
  const params = new URLSearchParams(current.startsWith("?") ? current.slice(1) : current);
  if (mode === DEFAULT_VIEW) params.delete("view");
  else params.set("view", mode);
  const s = params.toString();
  return s ? `?${s}` : "";
}
