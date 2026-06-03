import "server-only";
/**
 * Team / multi-user (§5.6, Phase 4, gated by entitlements.team). A builder_admin
 * invites teammates by email; accepting the magic invitation link creates a
 * builder_member on the tenant. No passwords — magic-link only.
 *
 * builder_member can do everything builder_admin can EXCEPT manage billing, team,
 * tier-gated settings (custom domain), or delete the tenant — see
 * `roleCanAdminister` (enforced at the API boundary via authz.requireBuilderAdmin).
 */

import { randomBytes } from "node:crypto";
import { prisma } from "./db.js";

export const INVITE_TTL_DAYS = 7;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface InviteResult {
  invitationId: string;
  token: string;
  email: string;
  expiresAt: string;
}

export async function inviteMember(
  tenantId: string,
  rawEmail: string,
  opts: { now?: Date } = {},
): Promise<InviteResult | { error: "invalid_email" | "already_member" }> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "invalid_email" };

  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) return { error: "already_member" };

  const now = opts.now ?? new Date();
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const inv = await prisma.invitation.create({
    data: { tenantId, email, role: "builder_member", token, expiresAt },
  });
  return { invitationId: inv.id, token, email, expiresAt: expiresAt.toISOString() };
}

export interface AcceptResult {
  userId: string;
  tenantId: string;
  email: string;
  role: "builder_member";
}

export async function acceptInvitation(
  token: string,
  opts: { now?: Date } = {},
): Promise<AcceptResult | { error: "invalid_token" | "expired" | "already_accepted" }> {
  const inv = await prisma.invitation.findUnique({ where: { token } });
  if (!inv) return { error: "invalid_token" };
  if (inv.acceptedAt) return { error: "already_accepted" };
  const now = opts.now ?? new Date();
  if (inv.expiresAt.getTime() < now.getTime()) return { error: "expired" };

  // Idempotent membership: reuse an existing user row for this (tenant, email).
  const user =
    (await prisma.user.findFirst({ where: { tenantId: inv.tenantId, email: inv.email } })) ??
    (await prisma.user.create({ data: { tenantId: inv.tenantId, email: inv.email, role: "builder_member" } }));
  await prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: now } });

  return { userId: user.id, tenantId: inv.tenantId, email: user.email, role: "builder_member" };
}

export async function listTeam(tenantId: string): Promise<{
  members: { id: string; email: string; role: string }[];
  pending: { id: string; email: string; expiresAt: string }[];
}> {
  const [members, invites] = await Promise.all([
    prisma.user.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({ where: { tenantId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    members: members.map((m) => ({ id: m.id, email: m.email, role: m.role })),
    pending: invites.map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt.toISOString() })),
  };
}
