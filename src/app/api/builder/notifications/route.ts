import { NextResponse } from "next/server";
import { requireBuilderTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent notifications + unread count for the dashboard panel. */
export async function GET(): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const [items, unread] = await Promise.all([
    auth.ctx.scope.listNotifications(20),
    auth.ctx.scope.countUnreadNotifications(),
  ]);
  return NextResponse.json({ items, unread });
}

/** Mark all notifications read. */
export async function POST(): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const count = await auth.ctx.scope.markNotificationsRead();
  return NextResponse.json({ ok: true, marked: count });
}
