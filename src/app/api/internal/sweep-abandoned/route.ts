import { NextResponse, type NextRequest } from "next/server";
import { runAbandonedSweep } from "@/lib/sweepAbandoned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron entrypoint for the abandoned sweep (§8 Phase 3 item 6). Protected by the
 * `X-Cron-Secret` header matching `CRON_SECRET`. Wire to Vercel Cron (hourly).
 * Local: `curl -X POST -H "X-Cron-Secret: $CRON_SECRET" localhost:3000/api/internal/sweep-abandoned`.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await runAbandonedSweep();
  return NextResponse.json({ ok: true, ...result });
}

export const POST = handle;
// Vercel Cron issues GET; accept both.
export const GET = handle;
