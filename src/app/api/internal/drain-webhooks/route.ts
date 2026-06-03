import { NextResponse, type NextRequest } from "next/server";
import { drainWebhooks } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron entrypoint to dispatch due webhook deliveries (§5.9). Protected by the
 * `X-Cron-Secret` header (reused from Phase 3). Hourly via vercel.json.
 * Local: `curl -X POST -H "X-Cron-Secret: $CRON_SECRET" localhost:3000/api/internal/drain-webhooks`.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await drainWebhooks();
  return NextResponse.json({ ok: true, ...result });
}

export const POST = handle;
export const GET = handle;
