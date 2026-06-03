import { NextResponse, type NextRequest } from "next/server";
import type { DockConfig } from "@/engine";
import { validationEngine } from "@/engine";
import { requireBuilderTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List templates (any builder). */
export async function GET(): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const templates = (await auth.ctx.scope.listTemplates()).map((t) => ({
    id: t.id,
    name: t.name,
    dockType: t.config.dockType,
    createdAt: t.createdAt,
  }));
  return NextResponse.json({ templates });
}

/**
 * Save a template (any builder). Accepts a config directly or a designId to
 * snapshot the design's current revision. No tier gate (templates help Starter).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json()) as { name?: string; config?: DockConfig; designId?: string };
  if (!body.name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  let config = body.config;
  if (!config && body.designId) {
    const design = await auth.ctx.scope.getDesign(body.designId);
    const rev = design ? await auth.ctx.scope.getRevision(design.currentRevisionId) : undefined;
    config = rev?.config;
  }
  if (!config) return NextResponse.json({ error: "missing_config" }, { status: 400 });
  // Stamp onto this tenant and sanity-check it's a valid engine config.
  config = { ...config, tenantId: auth.ctx.meta.id };
  if (validationEngine(config).derived.deckAreaFt2 <= 0) {
    return NextResponse.json({ error: "invalid_config" }, { status: 400 });
  }

  const template = await auth.ctx.scope.createTemplate({ name: body.name, config, createdBy: auth.userId });
  return NextResponse.json({ ok: true, templateId: template.id });
}
