import "server-only";
/**
 * Tenant scope — the ONLY way the application reads or writes tenant-owned rows.
 *
 * `createTenantScope(tenantId)` returns a repository whose every query is
 * filtered by that tenantId:
 *   - reads use `findFirst({ where: { id, tenantId } })` so a row owned by
 *     another tenant resolves to `null` (never leaks);
 *   - writes use `updateMany({ where: { id, tenantId } })` so a cross-tenant
 *     write affects 0 rows (never mutates another tenant's data);
 *   - creates force `tenantId` from the scope, ignoring any caller-supplied id.
 *
 * This is the seam proven by lib/tenantScope.test.ts: tenant A cannot read or
 * write tenant B's rows. No other module may query these tables directly.
 */
import type {
  DockConfig,
  FloatSpec,
  PricingProfile as EnginePricingProfile,
  SiteConditions,
} from "@/engine";
import { prisma } from "./db.js";
import type {
  Branding,
  Consent,
  Customer,
  Design,
  Lead,
  Revision,
} from "./types.js";

type Prisma = typeof prisma;

// ---- Row → domain mappers --------------------------------------------------

function toCustomer(r: NonNullable<Awaited<ReturnType<Prisma["customer"]["findFirst"]>>>): Customer {
  return {
    id: r.id,
    email: r.email,
    ...(r.savedShoreline ? { savedShoreline: r.savedShoreline as unknown as SiteConditions } : {}),
    ...(r.consent ? { consent: r.consent as unknown as Consent } : {}),
    createdAt: r.createdAt.toISOString(),
  };
}

function toDesign(r: NonNullable<Awaited<ReturnType<Prisma["design"]["findFirst"]>>>): Design {
  return {
    id: r.id,
    tenantId: r.tenantId,
    customerId: r.customerId,
    name: r.name,
    currentRevisionId: r.currentRevisionId,
    status: r.status as Design["status"],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toRevision(r: NonNullable<Awaited<ReturnType<Prisma["revision"]["findFirst"]>>>): Revision {
  return {
    id: r.id,
    designId: r.designId,
    version: r.version,
    config: r.config as unknown as DockConfig,
    schemaVersion: r.schemaVersion,
    estimateSnapshot: (r.estimateSnapshot as Revision["estimateSnapshot"]) ?? null,
    authorRole: r.authorRole as Revision["authorRole"],
    authorId: r.authorId,
    createdAt: r.createdAt.toISOString(),
    changeSummary: r.changeSummary,
  };
}

function toLead(r: NonNullable<Awaited<ReturnType<Prisma["lead"]["findFirst"]>>>): Lead {
  return {
    id: r.id,
    tenantId: r.tenantId,
    designId: r.designId,
    customerId: r.customerId,
    customerContact: r.customerContact as unknown as { email: string },
    consent: r.consent as unknown as Consent,
    status: "started",
    abandonedThresholdDays: r.abandonedThresholdDays ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface TenantScope {
  readonly tenantId: string;

  // Customers
  getCustomer(id: string): Promise<Customer | undefined>;
  findCustomerByEmail(email: string): Promise<Customer | undefined>;
  createAnonymousCustomer(): Promise<Customer>;
  updateCustomer(id: string, patch: Partial<Customer>): Promise<Customer | undefined>;
  upsertCustomer(email: string, patch?: Partial<Customer>): Promise<Customer>;

  // Designs
  getDesign(id: string): Promise<Design | undefined>;
  listDesignsByCustomer(customerId: string): Promise<Design[]>;
  countDrafts(customerId: string): Promise<number>;
  createDesign(input: Omit<Design, "id" | "tenantId" | "createdAt" | "updatedAt">): Promise<Design>;
  updateDesign(id: string, patch: Partial<Design>): Promise<Design | undefined>;

  // Revisions (immutable)
  addRevision(rev: Revision): Promise<Revision>;
  getRevision(id: string): Promise<Revision | undefined>;
  listRevisions(designId: string): Promise<Revision[]>;

  // Leads
  findLeadByDesign(designId: string): Promise<Lead | undefined>;
  upsertLead(input: Omit<Lead, "tenantId">): Promise<Lead>;
  countLeads(): Promise<number>;

  // Branding + catalog/pricing
  getBranding(): Promise<Branding | undefined>;
  getPricingProfile(dockType: string): Promise<EnginePricingProfile | undefined>;
  floatCatalog(): Promise<Record<string, FloatSpec>>;
}

export function createTenantScope(tenantId: string): TenantScope {
  return {
    tenantId,

    // ---- Customers --------------------------------------------------------
    async getCustomer(id) {
      const r = await prisma.customer.findFirst({ where: { id, tenantId } });
      return r ? toCustomer(r) : undefined;
    },
    async findCustomerByEmail(email) {
      const r = await prisma.customer.findFirst({
        where: { tenantId, email: { equals: email, mode: "insensitive" } },
      });
      return r ? toCustomer(r) : undefined;
    },
    async createAnonymousCustomer() {
      const r = await prisma.customer.create({ data: { tenantId, email: "" } });
      return toCustomer(r);
    },
    async updateCustomer(id, patch) {
      const res = await prisma.customer.updateMany({
        where: { id, tenantId },
        data: customerPatch(patch),
      });
      if (res.count === 0) return undefined;
      const r = await prisma.customer.findFirst({ where: { id, tenantId } });
      return r ? toCustomer(r) : undefined;
    },
    async upsertCustomer(email, patch = {}) {
      const existing = await prisma.customer.findFirst({
        where: { tenantId, email: { equals: email, mode: "insensitive" } },
      });
      if (existing) {
        await prisma.customer.update({ where: { id: existing.id }, data: customerPatch(patch) });
        const r = await prisma.customer.findFirst({ where: { id: existing.id, tenantId } });
        return toCustomer(r!);
      }
      const r = await prisma.customer.create({ data: { tenantId, email, ...customerPatch(patch) } });
      return toCustomer(r);
    },

    // ---- Designs ----------------------------------------------------------
    async getDesign(id) {
      const r = await prisma.design.findFirst({ where: { id, tenantId } });
      return r ? toDesign(r) : undefined;
    },
    async listDesignsByCustomer(customerId) {
      const rows = await prisma.design.findMany({
        where: { tenantId, customerId },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(toDesign);
    },
    async countDrafts(customerId) {
      return prisma.design.count({ where: { tenantId, customerId, status: "draft" } });
    },
    async createDesign(input) {
      const r = await prisma.design.create({
        data: {
          tenantId,
          customerId: input.customerId,
          name: input.name,
          currentRevisionId: input.currentRevisionId,
          status: input.status,
        },
      });
      return toDesign(r);
    },
    async updateDesign(id, patch) {
      const data: Record<string, unknown> = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.currentRevisionId !== undefined) data.currentRevisionId = patch.currentRevisionId;
      if (patch.status !== undefined) data.status = patch.status;
      const res = await prisma.design.updateMany({ where: { id, tenantId }, data });
      if (res.count === 0) return undefined;
      const r = await prisma.design.findFirst({ where: { id, tenantId } });
      return r ? toDesign(r) : undefined;
    },

    // ---- Revisions --------------------------------------------------------
    async addRevision(rev) {
      // Guard: the design must belong to this tenant before we attach a revision.
      const design = await prisma.design.findFirst({ where: { id: rev.designId, tenantId } });
      if (!design) throw new Error("addRevision: design not in tenant scope");
      const r = await prisma.revision.create({
        data: {
          id: rev.id,
          tenantId,
          designId: rev.designId,
          version: rev.version,
          config: rev.config as unknown as object,
          schemaVersion: rev.schemaVersion,
          estimateSnapshot: (rev.estimateSnapshot as unknown as object) ?? undefined,
          authorRole: rev.authorRole,
          authorId: rev.authorId,
          changeSummary: rev.changeSummary,
          createdAt: new Date(rev.createdAt),
        },
      });
      return toRevision(r);
    },
    async getRevision(id) {
      const r = await prisma.revision.findFirst({ where: { id, tenantId } });
      return r ? toRevision(r) : undefined;
    },
    async listRevisions(designId) {
      const rows = await prisma.revision.findMany({
        where: { tenantId, designId },
        orderBy: { version: "asc" },
      });
      return rows.map(toRevision);
    },

    // ---- Leads ------------------------------------------------------------
    async findLeadByDesign(designId) {
      const r = await prisma.lead.findFirst({ where: { tenantId, designId } });
      return r ? toLead(r) : undefined;
    },
    async upsertLead(input) {
      const existing = await prisma.lead.findFirst({ where: { tenantId, designId: input.designId } });
      const data = {
        customerId: input.customerId,
        customerContact: input.customerContact as unknown as object,
        consent: input.consent as unknown as object,
        status: input.status,
        abandonedThresholdDays: input.abandonedThresholdDays ?? null,
      };
      if (existing) {
        await prisma.lead.update({ where: { id: existing.id }, data });
        const r = await prisma.lead.findFirst({ where: { id: existing.id, tenantId } });
        return toLead(r!);
      }
      const r = await prisma.lead.create({
        data: { id: input.id, tenantId, designId: input.designId, ...data, createdAt: new Date(input.createdAt) },
      });
      return toLead(r);
    },
    async countLeads() {
      return prisma.lead.count({ where: { tenantId } });
    },

    // ---- Branding + catalog ----------------------------------------------
    async getBranding() {
      const r = await prisma.branding.findFirst({ where: { tenantId } });
      if (!r) return undefined;
      return {
        tenantId: r.tenantId,
        name: r.name,
        logoText: r.logoText,
        ...(r.logoUrl ? { logoUrl: r.logoUrl } : {}),
        primaryColor: r.primaryColor,
        secondaryColor: r.secondaryColor,
        removeBadge: r.removeBadge,
      };
    },
    async getPricingProfile(dockType) {
      const p = await prisma.pricingProfile.findFirst({
        where: { tenantId, dockType },
        include: { items: { where: { enabled: true } } },
      });
      if (!p) return undefined;
      return {
        tenantId: p.tenantId,
        dockType: p.dockType as EnginePricingProfile["dockType"],
        priceVisibility: p.priceVisibility as EnginePricingProfile["priceVisibility"],
        currency: p.currency,
        items: p.items.map((it) => ({
          key: it.key,
          unit: it.unit as EnginePricingProfile["items"][number]["unit"],
          unitPrice: it.unitPrice,
          ...(it.label ? { label: it.label } : {}),
        })),
        ...(p.labor ? { labor: p.labor as EnginePricingProfile["labor"] } : {}),
        ...(p.deliveryBands ? { deliveryBands: p.deliveryBands as unknown as EnginePricingProfile["deliveryBands"] } : {}),
        ...(p.minimumPrice != null ? { minimumPrice: p.minimumPrice } : {}),
        ...(p.markupPct != null ? { markupPct: p.markupPct } : {}),
      };
    },
    async floatCatalog() {
      const rows = await prisma.floatProduct.findMany({ where: { tenantId, enabled: true } });
      const out: Record<string, FloatSpec> = {};
      for (const f of rows) {
        out[f.sku] = {
          sku: f.sku,
          ratedBuoyancyLbs: f.ratedBuoyancyLbs,
          lengthIn: f.lengthIn,
          widthIn: f.widthIn,
          heightIn: f.heightIn,
          sealedShell: f.sealedShell,
        };
      }
      return out;
    },
  };
}

function customerPatch(patch: Partial<Customer>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.savedShoreline !== undefined) data.savedShoreline = patch.savedShoreline as unknown as object;
  if (patch.consent !== undefined) data.consent = patch.consent as unknown as object;
  return data;
}
