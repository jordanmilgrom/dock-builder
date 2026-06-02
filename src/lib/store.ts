/**
 * Tiny file-based persistence for Phase 1 (single dev tenant).
 *
 * Designed behind a narrow interface so Phase 2 can swap in Prisma/Postgres
 * with tenant-scoped queries without touching callers. Not concurrency-hardened
 * — adequate for a dev tenant; production multi-tenancy is Phase 2.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Customer, Design, Lead, Revision } from "./types.js";

interface DB {
  customers: Customer[];
  designs: Design[];
  revisions: Revision[];
  leads: Lead[];
}

const DATA_FILE = process.env.DOCK_DATA_FILE ?? join(process.cwd(), ".data", "store.json");

function emptyDb(): DB {
  return { customers: [], designs: [], revisions: [], leads: [] };
}

function load(): DB {
  if (!existsSync(DATA_FILE)) return emptyDb();
  try {
    return { ...emptyDb(), ...(JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<DB>) };
  } catch {
    return emptyDb();
  }
}

function save(db: DB): void {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function uuid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

// ---- Customers -------------------------------------------------------------

export function findCustomerByEmail(email: string): Customer | undefined {
  return load().customers.find((c) => c.email.toLowerCase() === email.toLowerCase());
}

export function getCustomer(id: string): Customer | undefined {
  return load().customers.find((c) => c.id === id);
}

export function createAnonymousCustomer(): Customer {
  const db = load();
  const customer: Customer = { id: uuid("cust"), email: "", createdAt: new Date().toISOString() };
  db.customers.push(customer);
  save(db);
  return customer;
}

export function updateCustomer(id: string, patch: Partial<Customer>): Customer | undefined {
  const db = load();
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) return undefined;
  Object.assign(customer, patch);
  save(db);
  return customer;
}

export function upsertCustomer(email: string, patch: Partial<Customer> = {}): Customer {
  const db = load();
  let customer = db.customers.find((c) => c.email.toLowerCase() === email.toLowerCase());
  if (customer) {
    Object.assign(customer, patch);
  } else {
    customer = { id: uuid("cust"), email, createdAt: new Date().toISOString(), ...patch };
    db.customers.push(customer);
  }
  save(db);
  return customer;
}

// ---- Designs ---------------------------------------------------------------

export function getDesign(id: string): Design | undefined {
  return load().designs.find((d) => d.id === id);
}

export function listDesignsByCustomer(customerId: string): Design[] {
  return load().designs.filter((d) => d.customerId === customerId);
}

export function countDrafts(customerId: string): number {
  return load().designs.filter((d) => d.customerId === customerId && d.status === "draft").length;
}

export function createDesign(input: Omit<Design, "id" | "createdAt" | "updatedAt">): Design {
  const db = load();
  const now = new Date().toISOString();
  const design: Design = { ...input, id: uuid("dsn"), createdAt: now, updatedAt: now };
  db.designs.push(design);
  save(db);
  return design;
}

export function updateDesign(id: string, patch: Partial<Design>): Design | undefined {
  const db = load();
  const design = db.designs.find((d) => d.id === id);
  if (!design) return undefined;
  Object.assign(design, patch, { updatedAt: new Date().toISOString() });
  save(db);
  return design;
}

// ---- Revisions (immutable) -------------------------------------------------

export function addRevision(rev: Revision): Revision {
  const db = load();
  db.revisions.push(rev);
  save(db);
  return rev;
}

export function getRevision(id: string): Revision | undefined {
  return load().revisions.find((r) => r.id === id);
}

export function listRevisions(designId: string): Revision[] {
  return load()
    .revisions.filter((r) => r.designId === designId)
    .sort((a, b) => a.version - b.version);
}

// ---- Leads -----------------------------------------------------------------

export function findLeadByDesign(designId: string): Lead | undefined {
  return load().leads.find((l) => l.designId === designId);
}

export function upsertLead(lead: Lead): Lead {
  const db = load();
  const idx = db.leads.findIndex((l) => l.designId === lead.designId);
  if (idx >= 0) db.leads[idx] = lead;
  else db.leads.push(lead);
  save(db);
  return lead;
}

export function newId(prefix: string): string {
  return uuid(prefix);
}
