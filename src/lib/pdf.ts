/**
 * Branded PDF generation (spec §6). Server-side only.
 *
 * Renders the same engine `Drawing` primitives used on screen into a PDF
 * (pdfkit), and assembles the title block, bill of materials, estimate (gated
 * by the profile's price-visibility), and the evergreen disclaimer on every
 * sheet. It calls the engines for geometry/validation/pricing — it never
 * recomputes them.
 */

import PDFDocument from "pdfkit";
import {
  allViews,
  estWeightLbs,
  gangwaySlopePct,
  validationEngine,
  type Drawing,
  type PricingResult,
  type Shape,
} from "@/engine";
import type { Branding, Revision } from "./types.js";
import { DISCLAIMER } from "./seed.js";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfInput {
  branding: Branding;
  revision: Revision;
  projectName: string;
  customerEmail: string | null;
}

const MARGIN = 44;

export function buildDesignPdf(input: PdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: MARGIN, bufferPages: true });
  const done = streamToBuffer(doc);

  const { revision, branding } = input;
  const config = revision.config;
  const estimate = revision.estimateSnapshot;
  const derived = validationEngine(config).derived;
  const views = allViews(config);
  const pageW = doc.page.width;

  // ---- Sheet 1: header + title block + plan ----
  drawHeader(doc, branding, input.projectName);
  let y = drawTitleBlock(doc, input, derived);
  const plan = views.find((v) => v.id === "plan")!;
  renderDrawing(doc, plan, { x: MARGIN, y: y + 8, w: pageW - 2 * MARGIN, h: 250 });
  captionView(doc, plan, y + 8);

  // ---- Sheet 2: elevations + isometric ----
  doc.addPage();
  drawHeader(doc, branding, input.projectName);
  const colW = (pageW - 2 * MARGIN - 16) / 2;
  const top = 96;
  const side = views.find((v) => v.id === "side_elevation")!;
  const end = views.find((v) => v.id === "end_elevation")!;
  const iso = views.find((v) => v.id === "isometric")!;
  renderDrawing(doc, side, { x: MARGIN, y: top, w: colW, h: 200 });
  captionView(doc, side, top);
  renderDrawing(doc, end, { x: MARGIN + colW + 16, y: top, w: colW, h: 200 });
  captionView(doc, end, top, MARGIN + colW + 16);
  renderDrawing(doc, iso, { x: MARGIN, y: top + 230, w: pageW - 2 * MARGIN, h: 230 });
  captionView(doc, iso, top + 230);

  // ---- Sheet 3: bill of materials + estimate ----
  doc.addPage();
  drawHeader(doc, branding, input.projectName);
  drawBomAndEstimate(doc, estimate, input.customerEmail);

  // Disclaimer on every sheet.
  stampDisclaimerOnAllPages(doc, branding);

  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// Sheet sections
// ---------------------------------------------------------------------------

function drawHeader(doc: PDFKit.PDFDocument, branding: Branding, project: string): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, 64).fill(branding.secondaryColor);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(branding.logoText, MARGIN, 18, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#cbd5e1")
    .text(project, MARGIN, 40, { lineBreak: false });
  doc.restore();
  doc.y = 76;
}

function drawTitleBlock(
  doc: PDFKit.PDFDocument,
  input: PdfInput,
  derived: ReturnType<typeof validationEngine>["derived"],
): number {
  const config = input.revision.config;
  const slope = gangwaySlopePct(config);
  const rows: [string, string][] = [
    ["Project", input.projectName],
    ["Customer", input.customerEmail ?? "—"],
    ["Builder", input.branding.name],
    ["Date", new Date(input.revision.createdAt).toLocaleDateString("en-US")],
    ["Revision", `v${input.revision.version}`],
    ["Dock type", `${config.dockType} (${config.use})`],
    ["Dimensions", `${config.overall.lengthFt} × ${config.overall.widthFt} ft`],
    ["Deck area", `${derived.deckAreaFt2} ft²`],
    ["Est. weight", `${derived.estWeightLbs.toLocaleString()} lbs`],
    [
      config.dockType === "floating" ? "Buoyancy / floats" : "Pilings",
      config.dockType === "floating"
        ? `${derived.requiredBuoyancyLbs.toLocaleString()} lbs / ${derived.floatCount} floats`
        : `${derived.pilingCount}`,
    ],
    [
      "Gangway",
      derived.gangwayLengthFt > 0
        ? `${derived.gangwayLengthFt} ft @ ${slope ?? "—"}%`
        : "none",
    ],
  ];

  const startY = doc.y + 4;
  const col2 = doc.page.width / 2;
  const lineH = 15;
  doc.fontSize(9);
  rows.forEach((r, i) => {
    const x = i % 2 === 0 ? MARGIN : col2;
    const yy = startY + Math.floor(i / 2) * lineH;
    doc.font("Helvetica-Bold").fillColor("#475569").text(`${r[0]}: `, x, yy, { continued: true, lineBreak: false });
    doc.font("Helvetica").fillColor("#0f172a").text(r[1], { lineBreak: false });
  });
  // est. weight derived used here purely for display; reference to avoid lint.
  void estWeightLbs;
  return startY + Math.ceil(rows.length / 2) * lineH + 6;
}

function captionView(doc: PDFKit.PDFDocument, d: Drawing, boxTop: number, x = MARGIN): void {
  doc.font("Helvetica-Oblique").fontSize(8).fillColor("#64748b").text(d.title, x, boxTop - 12, { lineBreak: false });
}

function drawBomAndEstimate(
  doc: PDFKit.PDFDocument,
  estimate: PricingResult | null,
  customerEmail: string | null,
): void {
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a").text("Bill of materials", MARGIN, 84);
  doc.moveDown(0.3);

  if (!estimate || estimate.lineItems.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("No priced components.");
    return;
  }

  const visible = priceVisible(estimate, customerEmail);
  const rightX = doc.page.width - MARGIN;
  doc.fontSize(9);
  for (const li of estimate.lineItems) {
    const y = doc.y;
    doc.font("Helvetica").fillColor("#0f172a").text(`${li.label} — ${li.qty} ${unitLabel(li.unit)}`, MARGIN, y, { lineBreak: false });
    if (visible) {
      doc.text(money(li.subtotal, estimate.currency), MARGIN, y, { width: rightX - MARGIN, align: "right", lineBreak: false });
    }
    doc.moveDown(0.5);
  }

  doc.moveDown(0.5);
  doc.moveTo(MARGIN, doc.y).lineTo(rightX, doc.y).stroke("#cbd5e1");
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a").text("Estimate");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10);

  if (!visible) {
    doc.fillColor("#64748b").text("Enter your contact info on the configurator to view this builder's estimate.");
    return;
  }

  switch (estimate.priceVisibility) {
    case "total":
      line(doc, "Total", money(estimate.total, estimate.currency), true);
      break;
    case "starting_from":
      line(doc, "Starting from", money(estimate.total, estimate.currency), true);
      break;
    default: {
      line(doc, "Materials & components", money(estimate.itemsSubtotal, estimate.currency));
      if (estimate.labor) line(doc, "Labor / install", money(estimate.labor, estimate.currency));
      if (estimate.delivery) line(doc, "Delivery", money(estimate.delivery, estimate.currency));
      if (estimate.markup) line(doc, "Markup", money(estimate.markup, estimate.currency));
      if (estimate.minimumApplied) line(doc, "Minimum applied", "");
      line(doc, "Total", money(estimate.total, estimate.currency), true);
    }
  }
  for (const note of estimate.notes) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#94a3b8").text(`Note: ${note}`);
  }
}

function line(doc: PDFKit.PDFDocument, label: string, value: string, bold = false): void {
  const y = doc.y;
  const rightX = doc.page.width - MARGIN;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor("#0f172a");
  doc.text(label, MARGIN, y, { lineBreak: false });
  doc.text(value, MARGIN, y, { width: rightX - MARGIN, align: "right", lineBreak: false });
  doc.moveDown(0.5);
}

function stampDisclaimerOnAllPages(doc: PDFKit.PDFDocument, branding: Branding): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 34;
    doc.font("Helvetica").fontSize(7).fillColor("#94a3b8");
    doc.text(DISCLAIMER, MARGIN, y, { width: doc.page.width - 2 * MARGIN, align: "center", lineBreak: true });
    if (!branding.removeBadge) {
      doc.fontSize(7).fillColor("#cbd5e1").text("Powered by Dock Configurator", MARGIN, doc.page.height - 14, {
        width: doc.page.width - 2 * MARGIN,
        align: "center",
        lineBreak: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Primitive → PDF mapper (mirrors the SVG renderer; geometry from the engine)
// ---------------------------------------------------------------------------

function renderDrawing(doc: PDFKit.PDFDocument, d: Drawing, box: Box): void {
  doc.save();
  const scale = Math.min(box.w / d.width, box.h / d.height);
  const tx = box.x + (box.w - d.width * scale) / 2;
  const ty = box.y + (box.h - d.height * scale) / 2;
  doc.translate(tx, ty).scale(scale);
  doc.rect(0, 0, d.width, d.height).clip();
  for (const s of d.shapes) drawShape(doc, s);
  doc.restore();
}

function drawShape(doc: PDFKit.PDFDocument, s: Shape): void {
  const st = s.style ?? {};
  const stroke = st.stroke ?? "#1f2937";
  const lw = st.strokeWidth ?? 1;
  doc.lineWidth(lw);
  doc.opacity(st.opacity ?? 1);
  if (st.dashed) doc.dash(4, { space: 3 });
  else doc.undash();

  switch (s.kind) {
    case "line":
      doc.moveTo(s.a.x, s.a.y).lineTo(s.b.x, s.b.y);
      if (stroke !== "none") doc.strokeColor(stroke).stroke();
      break;
    case "rect":
      doc.rect(s.x, s.y, Math.max(0, s.w), Math.max(0, s.h));
      paint(doc, st.fill, stroke);
      break;
    case "circle":
      doc.circle(s.c.x, s.c.y, s.r);
      paint(doc, st.fill ?? "#1f2937", stroke);
      break;
    case "polygon": {
      const pts = s.points.map((p) => [p.x, p.y] as [number, number]);
      if (pts.length > 0) {
        doc.polygon(...pts);
        if (s.closed === false) {
          if (stroke !== "none") doc.strokeColor(stroke).stroke();
        } else {
          paint(doc, st.fill, stroke);
        }
      }
      break;
    }
    case "text": {
      const size = st.fontSize ?? 11;
      doc.font(st.fontWeight === "bold" ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      doc.fillColor(st.fill ?? "#1f2937");
      let x = s.at.x;
      const w = doc.widthOfString(s.text);
      if (st.align === "middle") x -= w / 2;
      else if (st.align === "end") x -= w;
      doc.text(s.text, x, s.at.y - size * 0.8, { lineBreak: false });
      break;
    }
  }
  doc.opacity(1).undash();
}

function paint(doc: PDFKit.PDFDocument, fill: string | undefined, stroke: string): void {
  const hasFill = fill != null && fill !== "none";
  const hasStroke = stroke !== "none";
  if (hasFill && hasStroke) doc.fillColor(fill).strokeColor(stroke).fillAndStroke();
  else if (hasFill) doc.fillColor(fill).fill();
  else if (hasStroke) doc.strokeColor(stroke).stroke();
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function priceVisible(estimate: PricingResult, customerEmail: string | null): boolean {
  if (estimate.priceVisibility === "hidden_until_contact") return customerEmail != null;
  return true;
}

function money(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function unitLabel(unit: string): string {
  switch (unit) {
    case "per_ft2":
      return "ft²";
    case "per_linear_ft":
      return "lin ft";
    case "per_float":
      return "floats";
    case "per_pile":
      return "piles";
    case "each":
      return "ea";
    default:
      return unit;
  }
}

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
