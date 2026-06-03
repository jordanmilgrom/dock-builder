import { NextResponse, type NextRequest } from "next/server";
import { buildDesignPdf } from "@/lib/pdf";
import { requireCustomerDesign } from "@/lib/routeAuth";
import type { Branding } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireCustomerDesign(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const { ctx, design } = auth;
  const revision = await ctx.scope.getRevision(design.currentRevisionId);
  if (!revision) return NextResponse.json({ error: "no_revision" }, { status: 404 });

  const customer = await ctx.scope.getCustomer(design.customerId);
  const tenantBranding = await ctx.scope.getBranding();
  const ent = ctx.meta.entitlements;

  // Pro/Premium get the branded template (tenant logo + colors) and may remove
  // the badge; Starter gets the standard template with the "Powered by" badge.
  const branding: Branding = ent.brandedPdf
    ? {
        tenantId: ctx.meta.id,
        name: tenantBranding?.name ?? ctx.meta.name,
        logoText: tenantBranding?.logoText ?? ctx.meta.name.toUpperCase(),
        primaryColor: tenantBranding?.primaryColor ?? "#0e7490",
        secondaryColor: tenantBranding?.secondaryColor ?? "#0f172a",
        removeBadge: ent.removeBadge && (tenantBranding?.removeBadge ?? false),
      }
    : {
        tenantId: ctx.meta.id,
        name: ctx.meta.name,
        logoText: ctx.meta.name.toUpperCase(),
        primaryColor: "#334155",
        secondaryColor: "#0f172a",
        removeBadge: false,
      };

  const pdf = await buildDesignPdf({
    branding,
    revision,
    projectName: design.name,
    customerEmail: customer?.email || null,
  });

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${design.name.replace(/[^a-z0-9]+/gi, "-")}-v${revision.version}.pdf"`,
    },
  });
}
