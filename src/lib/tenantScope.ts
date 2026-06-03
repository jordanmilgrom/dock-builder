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
  EventKind,
  Job,
  JobMilestone,
  JobStatus,
  Lead,
  Notification,
  Revision,
  Template,
  WebhookEndpointSummary,
} from "./types.js";

function toJob(r: NonNullable<Awaited<ReturnType<typeof prisma.job.findFirst>>>): Job {
  return {
    id: r.id,
    tenantId: r.tenantId,
    leadId: r.leadId,
    status: r.status as JobStatus,
    milestones: (r.milestones as unknown as JobMilestone[]) ?? [],
    notes: r.notes ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toEndpoint(r: NonNullable<Awaited<ReturnType<typeof prisma.webhookEndpoint.findFirst>>>): WebhookEndpointSummary {
  return {
    id: r.id,
    url: r.url,
    eventKinds: r.eventKinds,
    createdAt: r.createdAt.toISOString(),
    lastDeliveryAt: r.lastDeliveryAt ? r.lastDeliveryAt.toISOString() : null,
    lastDeliveryStatus: r.lastDeliveryStatus ?? null,
  };
}

type PrismaProfileWithItems = NonNullable<
  Awaited<ReturnType<typeof prisma.pricingProfile.findFirst<{ include: { items: true } }>>>
>;

/** Map a Prisma pricing-profile row (+ enabled items) to the engine profile. */
function toEngineProfile(p: PrismaProfileWithItems): EnginePricingProfile {
  return {
    tenantId: p.tenantId,
    dockType: p.dockType as EnginePricingProfile["dockType"],
    priceVisibility: p.priceVisibility as EnginePricingProfile["priceVisibility"],
    currency: p.currency,
    items: p.items
      .filter((it) => it.enabled)
      .map((it) => ({
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
}

type Prisma = typeof prisma;

// ---- Row → domain mappers --------------------------------------------------

function toCustomer(r: NonNullable<Awaited<ReturnType<Prisma["customer"]["findFirst"]>>>): Customer {
  return {
    id: r.id,
    email: r.email,
    ...(r.savedShoreline ? { savedShoreline: r.savedShoreline as unknown as SiteConditions } : {}),
    ...(r.consent ? { consent: r.consent as unknown as Consent } : {}),
    ...(r.notes ? { notes: r.notes } : {}),
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
    pricingProfileId: r.pricingProfileId ?? null,
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
    status: r.status as Lead["status"],
    lastActivityAt: r.lastActivityAt.toISOString(),
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    quotedRevisionId: r.quotedRevisionId ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function toTemplate(r: NonNullable<Awaited<ReturnType<Prisma["template"]["findFirst"]>>>): Template {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    config: r.config as unknown as Template["config"],
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

function toNotification(r: NonNullable<Awaited<ReturnType<Prisma["notification"]["findFirst"]>>>): Notification {
  return {
    id: r.id,
    tenantId: r.tenantId,
    type: r.type as Notification["type"],
    leadId: r.leadId ?? null,
    title: r.title,
    body: r.body,
    read: r.read,
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

  listCustomers(): Promise<Customer[]>;

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
  getLead(id: string): Promise<Lead | undefined>;
  listLeads(): Promise<Lead[]>;
  findLeadByDesign(designId: string): Promise<Lead | undefined>;
  upsertLead(input: Omit<Lead, "tenantId">): Promise<Lead>;
  updateLead(id: string, patch: Partial<Omit<Lead, "id" | "tenantId">>): Promise<Lead | undefined>;
  countLeads(): Promise<number>;

  // Notifications
  createNotification(input: { type: Notification["type"]; leadId?: string | null; title: string; body: string }): Promise<Notification>;
  listNotifications(limit?: number): Promise<Notification[]>;
  countUnreadNotifications(): Promise<number>;
  markNotificationsRead(): Promise<number>;

  // Branding + catalog/pricing
  getBranding(): Promise<Branding | undefined>;
  getPricingProfile(dockType: string): Promise<EnginePricingProfile | undefined>;
  getPricingProfileById(id: string): Promise<EnginePricingProfile | undefined>;
  listPricingProfiles(): Promise<PricingProfileSummary[]>;
  createPricingProfile(input: {
    name: string;
    dockType: string;
    labor?: { perFt2?: number; flat?: number };
    fromDockType?: string;
  }): Promise<PricingProfileSummary | undefined>;
  floatCatalog(): Promise<Record<string, FloatSpec>>;

  // Templates (§5.6)
  createTemplate(input: { name: string; config: DockConfig; createdBy: string }): Promise<Template>;
  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;

  // Analytics events (§5.6)
  recordEvent(kind: EventKind, meta?: Record<string, unknown>): Promise<void>;

  // Jobs (§5.4 job phase, Phase 5)
  createJob(input: { leadId: string }): Promise<Job>;
  getJob(id: string): Promise<Job | undefined>;
  getJobByLead(leadId: string): Promise<Job | undefined>;
  listJobs(): Promise<Job[]>;
  updateJob(id: string, patch: { status?: JobStatus; notes?: string; milestones?: JobMilestone[] }): Promise<Job | undefined>;

  // Webhook endpoints (§5.9, Phase 5) — secret stored, never returned by reads.
  createWebhookEndpoint(input: { url: string; secret: string; eventKinds: string[] }): Promise<WebhookEndpointSummary>;
  listWebhookEndpoints(): Promise<WebhookEndpointSummary[]>;
  deleteWebhookEndpoint(id: string): Promise<boolean>;
  /** Enqueue a delivery to every endpoint subscribed to `kind`. Returns count. */
  enqueueWebhookEvent(kind: string, payload: unknown): Promise<number>;
}

export interface PricingProfileSummary {
  id: string;
  name: string;
  dockType: string;
  isDefault: boolean;
  priceVisibility: string;
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
    async listCustomers() {
      const rows = await prisma.customer.findMany({
        where: { tenantId, email: { not: "" } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toCustomer);
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
          ...(input.pricingProfileId ? { pricingProfileId: input.pricingProfileId } : {}),
        },
      });
      return toDesign(r);
    },
    async updateDesign(id, patch) {
      const data: Record<string, unknown> = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.currentRevisionId !== undefined) data.currentRevisionId = patch.currentRevisionId;
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.pricingProfileId !== undefined) data.pricingProfileId = patch.pricingProfileId;
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
    async getLead(id) {
      const r = await prisma.lead.findFirst({ where: { id, tenantId } });
      return r ? toLead(r) : undefined;
    },
    async listLeads() {
      const rows = await prisma.lead.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
      return rows.map(toLead);
    },
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
        lastActivityAt: new Date(input.lastActivityAt),
        submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
        quotedRevisionId: input.quotedRevisionId ?? null,
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
    async updateLead(id, patch) {
      const data: Record<string, unknown> = {};
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.lastActivityAt !== undefined) data.lastActivityAt = new Date(patch.lastActivityAt);
      if (patch.submittedAt !== undefined) data.submittedAt = patch.submittedAt ? new Date(patch.submittedAt) : null;
      if (patch.quotedRevisionId !== undefined) data.quotedRevisionId = patch.quotedRevisionId;
      const res = await prisma.lead.updateMany({ where: { id, tenantId }, data });
      if (res.count === 0) return undefined;
      const r = await prisma.lead.findFirst({ where: { id, tenantId } });
      return r ? toLead(r) : undefined;
    },
    async countLeads() {
      return prisma.lead.count({ where: { tenantId } });
    },

    // ---- Notifications ----------------------------------------------------
    async createNotification(input) {
      const r = await prisma.notification.create({
        data: { tenantId, type: input.type, leadId: input.leadId ?? null, title: input.title, body: input.body },
      });
      return toNotification(r);
    },
    async listNotifications(limit = 20) {
      const rows = await prisma.notification.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map(toNotification);
    },
    async countUnreadNotifications() {
      return prisma.notification.count({ where: { tenantId, read: false } });
    },
    async markNotificationsRead() {
      const res = await prisma.notification.updateMany({ where: { tenantId, read: false }, data: { read: true } });
      return res.count;
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
      // Prefer the default set; fall back to any profile for the dock type.
      const p =
        (await prisma.pricingProfile.findFirst({
          where: { tenantId, dockType, isDefault: true },
          include: { items: true },
        })) ??
        (await prisma.pricingProfile.findFirst({ where: { tenantId, dockType }, include: { items: true } }));
      return p ? toEngineProfile(p) : undefined;
    },
    async getPricingProfileById(id) {
      const p = await prisma.pricingProfile.findFirst({ where: { id, tenantId }, include: { items: true } });
      return p ? toEngineProfile(p) : undefined;
    },
    async listPricingProfiles() {
      const rows = await prisma.pricingProfile.findMany({
        where: { tenantId },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }, { dockType: "asc" }],
      });
      return rows.map((p) => ({
        id: p.id,
        name: p.name,
        dockType: p.dockType,
        isDefault: p.isDefault,
        priceVisibility: p.priceVisibility,
      }));
    },
    async createPricingProfile(input) {
      // Clone the default profile for the dock type (items + commercial terms).
      const base = await prisma.pricingProfile.findFirst({
        where: { tenantId, dockType: input.fromDockType ?? input.dockType, isDefault: true },
        include: { items: true },
      });
      if (!base) return undefined;
      const created = await prisma.pricingProfile.create({
        data: {
          tenantId,
          name: input.name,
          isDefault: false,
          dockType: input.dockType,
          priceVisibility: base.priceVisibility,
          currency: base.currency,
          labor: (input.labor ?? base.labor ?? undefined) as object | undefined,
          deliveryBands: (base.deliveryBands ?? undefined) as object | undefined,
          minimumPrice: base.minimumPrice,
          markupPct: base.markupPct,
          items: {
            create: base.items.map((it) => ({
              tenantId,
              key: it.key,
              unit: it.unit,
              unitPrice: it.unitPrice,
              ...(it.label ? { label: it.label } : {}),
              enabled: it.enabled,
            })),
          },
        },
      });
      return { id: created.id, name: created.name, dockType: created.dockType, isDefault: created.isDefault, priceVisibility: created.priceVisibility };
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

    // ---- Templates (§5.6) -------------------------------------------------
    async createTemplate(input) {
      const r = await prisma.template.create({
        data: { tenantId, name: input.name, config: input.config as unknown as object, createdBy: input.createdBy },
      });
      return toTemplate(r);
    },
    async listTemplates() {
      const rows = await prisma.template.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
      return rows.map(toTemplate);
    },
    async getTemplate(id) {
      const r = await prisma.template.findFirst({ where: { id, tenantId } });
      return r ? toTemplate(r) : undefined;
    },

    // ---- Analytics events (§5.6) ------------------------------------------
    async recordEvent(kind, meta) {
      await prisma.event.create({
        data: { tenantId, kind, ...(meta ? { meta: meta as object } : {}) },
      });
    },

    // ---- Jobs -------------------------------------------------------------
    async createJob(input) {
      const r = await prisma.job.create({ data: { tenantId, leadId: input.leadId } });
      return toJob(r);
    },
    async getJob(id) {
      const r = await prisma.job.findFirst({ where: { id, tenantId } });
      return r ? toJob(r) : undefined;
    },
    async getJobByLead(leadId) {
      const r = await prisma.job.findFirst({ where: { leadId, tenantId } });
      return r ? toJob(r) : undefined;
    },
    async listJobs() {
      const rows = await prisma.job.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
      return rows.map(toJob);
    },
    async updateJob(id, patch) {
      const data: Record<string, unknown> = {};
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.notes !== undefined) data.notes = patch.notes;
      if (patch.milestones !== undefined) data.milestones = patch.milestones as unknown as object;
      const res = await prisma.job.updateMany({ where: { id, tenantId }, data });
      if (res.count === 0) return undefined;
      const r = await prisma.job.findFirst({ where: { id, tenantId } });
      return r ? toJob(r) : undefined;
    },

    // ---- Webhook endpoints ------------------------------------------------
    async createWebhookEndpoint(input) {
      const r = await prisma.webhookEndpoint.create({
        data: { tenantId, url: input.url, secret: input.secret, eventKinds: input.eventKinds },
      });
      return toEndpoint(r);
    },
    async listWebhookEndpoints() {
      const rows = await prisma.webhookEndpoint.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
      return rows.map(toEndpoint);
    },
    async deleteWebhookEndpoint(id) {
      const res = await prisma.webhookEndpoint.deleteMany({ where: { id, tenantId } });
      return res.count > 0;
    },
    async enqueueWebhookEvent(kind, payload) {
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: { tenantId, eventKinds: { has: kind } },
        select: { id: true },
      });
      if (endpoints.length === 0) return 0;
      await prisma.webhookDelivery.createMany({
        data: endpoints.map((e) => ({
          tenantId,
          endpointId: e.id,
          eventKind: kind,
          payload: payload as object,
        })),
      });
      return endpoints.length;
    },
  };
}

function customerPatch(patch: Partial<Customer>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.savedShoreline !== undefined) data.savedShoreline = patch.savedShoreline as unknown as object;
  if (patch.consent !== undefined) data.consent = patch.consent as unknown as object;
  if (patch.notes !== undefined) data.notes = patch.notes;
  return data;
}
