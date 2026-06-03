import { beforeEach, describe, expect, it } from "vitest";
import { generateStartingDesign, validationEngine } from "@/engine";
import { resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { createDesignFromTemplate } from "@/lib/designService";

describe("starter templates (§5.6)", () => {
  beforeEach(resetDb);

  it("save template → customer 'start from template' creates a valid v1 design with the same config", async () => {
    const scope = await makeTenant("tmpl-co");
    const baseConfig = generateStartingDesign(SAMPLE_SITE, { tenantId: scope.tenantId, dockType: "floating" });
    const template = await scope.createTemplate({ name: "Starter floating dock", config: baseConfig, createdBy: "builder_1" });

    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromTemplate(scope, customer.id, template.id);
    if ("error" in created) throw new Error(created.error);

    // New design starts at v1 with the template's config (engine-validated).
    expect(created.revision.version).toBe(1);
    expect(created.revision.config.dockType).toBe("floating");
    expect(created.revision.config.overall.lengthFt).toBe(baseConfig.overall.lengthFt);
    expect(created.revision.config.tenantId).toBe(scope.tenantId);
    expect(validationEngine(created.revision.config).ok).toBe(true);
    // A priced estimate snapshot was produced on v1.
    expect(created.revision.estimateSnapshot?.total).toBeGreaterThan(0);
  });

  it("missing template id → not_found", async () => {
    const scope = await makeTenant("tmpl-co-2");
    const customer = await scope.createAnonymousCustomer();
    expect(await createDesignFromTemplate(scope, customer.id, "nope")).toEqual({ error: "not_found" });
  });
});
