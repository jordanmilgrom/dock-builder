import { NextResponse, type NextRequest } from "next/server";
import { requireBuilder } from "@/lib/authz";
import { prisma } from "@/lib/db";
import type { Entitlements } from "@/lib/entitlements";
import { isValidSlug, RESERVED_SUBDOMAINS } from "@/lib/tenantRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  name?: string;
  logoText?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  removeBadge?: boolean;
  slug?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Branding editor (§5.2): logo text/url, colors, badge toggle (tier-gated), vanity slug. */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const builder = requireBuilder();
  if (!builder) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as Body;

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: builder.tenantId } });
  const ent = tenant.entitlements as unknown as Entitlements;

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.logoText === "string") data.logoText = body.logoText;
  if (typeof body.logoUrl === "string") data.logoUrl = body.logoUrl || null;
  if (typeof body.primaryColor === "string" && HEX.test(body.primaryColor)) data.primaryColor = body.primaryColor;
  if (typeof body.secondaryColor === "string" && HEX.test(body.secondaryColor)) data.secondaryColor = body.secondaryColor;
  // Badge removal is gated by the tier entitlement (§10 #2).
  if (typeof body.removeBadge === "boolean") data.removeBadge = ent.removeBadge ? body.removeBadge : false;

  await prisma.branding.update({ where: { tenantId: builder.tenantId }, data });

  // Optional vanity slug change (custom domain remains Phase 4).
  let slugError: string | null = null;
  if (typeof body.slug === "string" && body.slug.toLowerCase() !== tenant.slug) {
    const slug = body.slug.toLowerCase();
    if (!isValidSlug(slug) || RESERVED_SUBDOMAINS.has(slug)) slugError = "invalid_slug";
    else if (await prisma.tenant.findUnique({ where: { slug } })) slugError = "slug_taken";
    else await prisma.tenant.update({ where: { id: builder.tenantId }, data: { slug } });
  }
  if (typeof body.name === "string" && body.name.trim()) {
    await prisma.tenant.update({ where: { id: builder.tenantId }, data: { name: body.name.trim() } });
  }

  return NextResponse.json({ ok: !slugError, ...(slugError ? { slugError } : {}) });
}
