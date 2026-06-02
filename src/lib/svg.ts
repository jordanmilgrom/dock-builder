/**
 * SVG renderer: a dumb mapper from engine `Drawing` primitives to an SVG
 * string. It computes no geometry — every coordinate comes from the blueprint
 * generator in `@/engine`. The same primitives drive the PDF renderer, so the
 * on-screen and printed drawings can never diverge.
 */

import type { Drawing, DrawStyle, Shape } from "@/engine";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function strokeAttrs(style: DrawStyle | undefined, defaultStroke = "#1f2937"): string {
  const stroke = style?.stroke ?? defaultStroke;
  const sw = style?.strokeWidth ?? 1;
  const dash = style?.dashed ? ` stroke-dasharray="5 3"` : "";
  const op = style?.opacity != null ? ` opacity="${style.opacity}"` : "";
  return `stroke="${stroke}" stroke-width="${sw}"${dash}${op}`;
}

function fillAttr(style: DrawStyle | undefined, fallback = "none"): string {
  return `fill="${style?.fill ?? fallback}"`;
}

function shapeToSvg(s: Shape): string {
  switch (s.kind) {
    case "line":
      return `<line x1="${s.a.x}" y1="${s.a.y}" x2="${s.b.x}" y2="${s.b.y}" ${strokeAttrs(s.style)} />`;
    case "rect":
      return `<rect x="${s.x}" y="${s.y}" width="${Math.max(0, s.w)}" height="${Math.max(0, s.h)}" ${fillAttr(s.style)} ${strokeAttrs(s.style, s.style?.stroke === "none" ? "none" : "#1f2937")} />`;
    case "circle":
      return `<circle cx="${s.c.x}" cy="${s.c.y}" r="${s.r}" ${fillAttr(s.style, "#1f2937")} ${strokeAttrs(s.style)} />`;
    case "polygon": {
      const pts = s.points.map((p) => `${p.x},${p.y}`).join(" ");
      const tag = s.closed === false ? "polyline" : "polygon";
      return `<${tag} points="${pts}" ${fillAttr(s.style)} ${strokeAttrs(s.style)} />`;
    }
    case "text": {
      const anchor = s.style?.align ?? "start";
      const size = s.style?.fontSize ?? 11;
      const weight = s.style?.fontWeight ?? "normal";
      const fill = s.style?.fill ?? "#1f2937";
      return `<text x="${s.at.x}" y="${s.at.y}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(s.text)}</text>`;
    }
  }
}

/** Render a Drawing to a standalone SVG string. */
export function drawingToSvg(d: Drawing): string {
  const body = d.shapes.map(shapeToSvg).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="100%" role="img" aria-label="${esc(d.title)}">\n  ${body}\n</svg>`;
}
