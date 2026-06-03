import "server-only";
/**
 * Custom domain support (§5.7, Phase 4, gated by entitlements.customDomain).
 *
 * Flow: builder sets a hostname → we mint a unique TXT token → builder adds the
 * record + a CNAME to our apex → we poll DNS until the TXT matches → mark
 * verified. Until verified, requests to the hostname show a placeholder.
 *
 * Resolution is O(1): the hostname is looked up against the unique, indexed
 * `Tenant.customDomain` column. DNS is injectable so verification is testable.
 */

import { promises as dnsPromises } from "node:dns";
import { randomBytes } from "node:crypto";
import { prisma } from "./db.js";

/** CNAME target a builder points their custom domain at (documented in PHASE4.md). */
export const CUSTOM_DOMAIN_CNAME_TARGET = process.env.CUSTOM_DOMAIN_TARGET ?? "cname.app.com";

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function isValidHostname(host: string): boolean {
  return HOSTNAME_RE.test(host.toLowerCase());
}

export function txtRecordName(domain: string): string {
  return `_dock-verify.${domain.toLowerCase()}`;
}

export function generateTxtToken(): string {
  return `dock-verify=${randomBytes(16).toString("hex")}`;
}

export interface DomainSetup {
  domain: string;
  txtName: string;
  txtValue: string;
  cnameTarget: string;
}

/** Set/replace a tenant's custom domain; resets verification + mints a token. */
export async function setCustomDomain(tenantId: string, rawDomain: string): Promise<DomainSetup | { error: "invalid_hostname" | "taken" }> {
  const domain = rawDomain.trim().toLowerCase();
  if (!isValidHostname(domain)) return { error: "invalid_hostname" };
  const existing = await prisma.tenant.findUnique({ where: { customDomain: domain } });
  if (existing && existing.id !== tenantId) return { error: "taken" };

  const token = generateTxtToken();
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { customDomain: domain, customDomainTxtToken: token, customDomainVerifiedAt: null },
  });
  return { domain, txtName: txtRecordName(domain), txtValue: token, cnameTarget: CUSTOM_DOMAIN_CNAME_TARGET };
}

export type TxtResolver = (name: string) => Promise<string[][]>;

/**
 * Poll DNS for the TXT token and mark verified on match. Returns the new
 * verification state. `resolveTxt` is injectable for tests.
 */
export async function verifyCustomDomain(
  tenantId: string,
  opts: { resolveTxt?: TxtResolver; now?: Date } = {},
): Promise<{ verified: boolean; reason?: string }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.customDomain || !tenant.customDomainTxtToken) return { verified: false, reason: "not_configured" };
  if (tenant.customDomainVerifiedAt) return { verified: true };

  const resolveTxt = opts.resolveTxt ?? ((name: string) => dnsPromises.resolveTxt(name));
  let records: string[][];
  try {
    records = await resolveTxt(txtRecordName(tenant.customDomain));
  } catch {
    return { verified: false, reason: "dns_lookup_failed" };
  }
  const flat = records.map((chunks) => chunks.join(""));
  if (!flat.includes(tenant.customDomainTxtToken)) return { verified: false, reason: "token_mismatch" };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { customDomainVerifiedAt: opts.now ?? new Date() },
  });
  return { verified: true };
}

export type DomainResolution =
  | { kind: "verified"; tenantId: string; slug: string }
  | { kind: "unverified"; tenantId: string; name: string }
  | { kind: "none" };

/** O(1) hostname → tenant lookup by the unique indexed column. */
export async function resolveByCustomDomain(host: string): Promise<DomainResolution> {
  const domain = host.trim().toLowerCase();
  const tenant = await prisma.tenant.findUnique({ where: { customDomain: domain } });
  if (!tenant) return { kind: "none" };
  if (tenant.customDomainVerifiedAt) return { kind: "verified", tenantId: tenant.id, slug: tenant.slug };
  return { kind: "unverified", tenantId: tenant.id, name: tenant.name };
}
