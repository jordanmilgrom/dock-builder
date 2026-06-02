import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = getSession();
  if (!session) return NextResponse.json({ session: null });
  const customer = store.getCustomer(session.customerId);
  return NextResponse.json({
    session: { customerId: session.customerId, email: customer?.email || null },
  });
}
