import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { notifyBuilder } from "@/lib/notifications";
import { requireBuilderAdminTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Configure notification channels (builder_admin; per-channel entitlement). */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireBuilderAdminTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const ent = auth.ctx.meta.entitlements;
  const body = (await req.json()) as { slackWebhookUrl?: string | null; twilioFromOverride?: string | null };

  const data: Record<string, unknown> = {};
  if (body.slackWebhookUrl !== undefined) {
    if (!ent.slackNotifications) return NextResponse.json({ error: "feature_locked", channel: "slack" }, { status: 403 });
    data.slackWebhookUrl = body.slackWebhookUrl || null;
  }
  if (body.twilioFromOverride !== undefined) {
    if (!ent.smsNotifications) return NextResponse.json({ error: "feature_locked", channel: "sms" }, { status: 403 });
    data.twilioFromOverride = body.twilioFromOverride || null;
  }
  await prisma.tenant.update({ where: { id: auth.ctx.meta.id }, data });
  return NextResponse.json({ ok: true });
}

/** Test-send on a channel (builder_admin; per-channel entitlement). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireBuilderAdminTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const ent = auth.ctx.meta.entitlements;
  const body = (await req.json()) as { channel?: "email" | "sms" | "slack"; to?: string };
  const channel = body.channel ?? "email";
  if (channel === "sms" && !ent.smsNotifications) return NextResponse.json({ error: "feature_locked" }, { status: 403 });
  if (channel === "slack" && !ent.slackNotifications) return NextResponse.json({ error: "feature_locked" }, { status: 403 });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: auth.ctx.meta.id } });
  const result = await notifyBuilder(channel, {
    tenantId: tenant.id,
    type: "new_lead",
    to: body.to ?? auth.ctx.meta.name,
    subject: "Test notification",
    body: "This is a test from your Dock Configurator dashboard.",
    ...(channel === "sms" ? { smsTo: body.to } : {}),
    ...(channel === "slack" ? { slackWebhookUrl: tenant.slackWebhookUrl ?? undefined } : {}),
  });
  return NextResponse.json({ ok: result.delivered, transport: result.transport });
}
