import { NextResponse, type NextRequest } from "next/server";
import type { SiteConditions } from "@/engine";
import { createSessionCookieValue, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth";
import { createDesignFromSite } from "@/lib/designService";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateBody {
  site: SiteConditions;
  dockType?: "floating" | "pile" | "pipe" | "crib" | "suspension";
  use?: "residential" | "commercial";
  name?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as CreateBody;
  if (!body?.site) return NextResponse.json({ error: "missing_site" }, { status: 400 });

  let session = getSession();
  let setCookie = false;
  if (!session) {
    const anon = store.createAnonymousCustomer();
    session = { customerId: anon.id, email: "" };
    setCookie = true;
  }

  const result = createDesignFromSite(session.customerId, body.site, {
    ...(body.dockType ? { dockType: body.dockType } : {}),
    ...(body.use ? { use: body.use } : {}),
    ...(body.name ? { name: body.name } : {}),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const res = NextResponse.json({ designId: result.design.id, revisionId: result.revision.id });
  if (setCookie) {
    res.cookies.set(SESSION_COOKIE, createSessionCookieValue(session.customerId, ""), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    });
  }
  return res;
}

export async function GET(): Promise<NextResponse> {
  const session = getSession();
  if (!session) return NextResponse.json({ designs: [] });
  const designs = store.listDesignsByCustomer(session.customerId).map((d) => {
    const rev = store.getRevision(d.currentRevisionId);
    return {
      id: d.id,
      name: d.name,
      status: d.status,
      dockType: rev?.config.dockType ?? null,
      version: rev?.version ?? 0,
      total: rev?.estimateSnapshot?.total ?? null,
      currency: rev?.estimateSnapshot?.currency ?? "USD",
      updatedAt: d.updatedAt,
    };
  });
  return NextResponse.json({ designs });
}
