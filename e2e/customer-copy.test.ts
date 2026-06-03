/**
 * Guard against Won/Lost leakage into customer-facing copy (§5.4). Scans the
 * components and pages a customer can see and fails if "Won" or "Lost" appears.
 * Builder/admin surfaces are intentionally excluded — they use that vocabulary.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Customer-facing component + page files (no builder/admin paths here).
const CUSTOMER_FILES = [
  "src/components/Configurator.tsx",
  "src/components/SaveGate.tsx",
  "src/components/QuestionnaireForm.tsx",
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
});
