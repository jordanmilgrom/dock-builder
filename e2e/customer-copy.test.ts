/**
 * Guard against Won/Lost leakage into customer-facing copy (§5.4). Scans the
 * components and pages a customer can see and fails if "Won" or "Lost" appears.
 * Builder/admin surfaces are intentionally excluded — they use that vocabulary.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_STATES, leadStatusLabel } from "@/lib/leadStatus";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Customer-facing component + page files (no builder/admin paths here).
const CUSTOMER_FILES = [
  "src/components/ConfiguratorPane.tsx",
  "src/components/CanvasMode.tsx",
  "src/components/CanvasLanding.tsx",
  "src/components/SchematicMode.tsx",
  "src/components/ThreeDMode.tsx",
  "src/components/PropertiesPanel.tsx",
  "src/components/PieceProperties.tsx",
  "src/components/DesignProperties.tsx",
  "src/components/PanelControls.tsx",
  "src/components/SaveGate.tsx",
  "src/components/ViewsPanel.tsx",
  "src/components/RevisionList.tsx",
  "src/components/CustomerStatusBadge.tsx",
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/designs/page.tsx",
  "src/app/design/[id]/page.tsx",
  "src/app/design/[id]/history/page.tsx",
];

describe("customer copy never leaks Won/Lost (§5.4)", () => {
  it("contains no Won/Lost tokens in any customer-facing file", () => {
    const offenders: string[] = [];
    for (const rel of CUSTOMER_FILES) {
      let src: string;
      try {
        src = readFileSync(resolve(ROOT, rel), "utf8");
      } catch {
        continue; // file may not exist in every phase; skip silently
      }
      // Match the words as standalone tokens, case-insensitive.
      if (/\b(won|lost)\b/i.test(src)) offenders.push(rel);
    }
    expect(offenders, `Won/Lost found in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("never renders the mid-state 'In progress' label to a customer (§5.4)", () => {
    // No customer-facing source hard-codes the old mid-state copy.
    const offenders: string[] = [];
    for (const rel of CUSTOMER_FILES) {
      let src: string;
      try { src = readFileSync(resolve(ROOT, rel), "utf8"); } catch { continue; }
      if (/in progress/i.test(src)) offenders.push(rel);
    }
    expect(offenders, `'In progress' found in: ${offenders.join(", ")}`).toEqual([]);

    // And no customer-audience status label is "In progress" for any state — a
    // "started" lead has no customer-facing label at all.
    for (const s of LEAD_STATES) {
      expect(leadStatusLabel(s, "customer")).not.toBe("In progress");
    }
    expect(leadStatusLabel("started", "customer")).toBe("");
  });
});
