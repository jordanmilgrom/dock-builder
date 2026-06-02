import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Configurator from "@/components/Configurator";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";

export const dynamic = "force-dynamic";

export default function DesignPage({ params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) redirect("/");
  const design = store.getDesign(params.id);
  if (!design) notFound();
  if (design.customerId !== session.customerId) redirect("/");
  const revision = store.getRevision(design.currentRevisionId);
  if (!revision) notFound();
  const customer = store.getCustomer(design.customerId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{design.name}</h1>
          <p className="text-xs text-slate-500">
            Draft · v{revision.version} ·{" "}
            <Link href={`/design/${design.id}/history`} className="text-brand hover:underline">
              version history
            </Link>
          </p>
        </div>
        <Link href="/designs" className="text-sm text-brand hover:underline">My designs →</Link>
      </div>
      <Configurator
        designId={design.id}
        initialConfig={revision.config}
        initialVersion={revision.version}
        emailCaptured={Boolean(customer?.email)}
      />
    </div>
  );
}
