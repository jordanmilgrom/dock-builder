import Link from "next/link";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";
import { DRAFT_CAP } from "@/lib/versioning";

export const dynamic = "force-dynamic";

export default function DesignsPage() {
  const session = getSession();
  const designs = session ? store.listDesignsByCustomer(session.customerId) : [];
  const drafts = designs.filter((d) => d.status === "draft").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My designs</h1>
        <Link href="/" className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
          + New design
        </Link>
      </div>
      <p className="text-xs text-slate-500">{drafts} / {DRAFT_CAP} drafts used</p>

      {designs.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No designs yet. Start one from the questionnaire.
        </p>
      ) : (
        <ul className="space-y-2">
          {designs.map((d) => {
            const rev = store.getRevision(d.currentRevisionId);
            return (
              <li key={d.id} className="flex items-center justify-between rounded border border-slate-200 bg-white p-3 text-sm">
                <div>
                  <Link href={`/design/${d.id}`} className="font-medium text-brand hover:underline">{d.name}</Link>
                  <p className="text-xs text-slate-500">
                    {rev?.config.dockType} · v{rev?.version ?? 0} · updated {new Date(d.updatedAt).toLocaleDateString("en-US")}
                  </p>
                </div>
                <Link href={`/design/${d.id}/history`} className="text-xs text-slate-500 hover:underline">history</Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
