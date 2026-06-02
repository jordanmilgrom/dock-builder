import type { SiteConditions } from "@/engine";
import QuestionnaireForm from "@/components/QuestionnaireForm";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const session = getSession();
  const saved: SiteConditions | undefined = session
    ? store.getCustomer(session.customerId)?.savedShoreline
    : undefined;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-900">Design your dock</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Answer a few questions about your shoreline. We&apos;ll recommend a dock type,
          seed a starting design, and give you a live planning-grade estimate as you
          build.
        </p>
      </section>
      <QuestionnaireForm defaultSite={saved ?? null} />
    </div>
  );
}
