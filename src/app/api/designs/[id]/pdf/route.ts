import { NextResponse, type NextRequest } from "next/server";
import { buildDesignPdf } from "@/lib/pdf";
import { devBranding } from "@/lib/seed";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const design = store.getDesign(params.id);
  if (!design) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (design.customerId !== session.customerId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const revision = store.getRevision(design.currentRevisionId);
  if (!revision) return NextResponse.json({ error: "no_revision" }, { status: 404 });

  const customer = store.getCustomer(design.customerId);
  const pdf = await buildDesignPdf({
    branding: devBranding,
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
