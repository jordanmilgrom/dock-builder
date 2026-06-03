import Link from "next/link";
import { redirect } from "next/navigation";
import CustomerNotes from "@/components/CustomerNotes";
import { requireBuilderTenant } from "@/lib/routeAuth";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const auth = await requireBuilderTenant();
  if (!auth.ok) redirect("/builder/login");
  const { ctx } = auth;

  const customers = await ctx.scope.listCustomers();
  const rows = await Promise.all(
    customers.map(async (c) => ({ customer: c, designs: (await ctx.scope.listDesignsByCustomer(c.id)).length })),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Customers</h1>
        <Link href="/builder" className="text-sm text-brand hover:underline">← dashboard</Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No customers yet. They appear here once someone captures contact on your hosted page.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ customer: c, designs }) => (
            <li key={c.id} className="rounded border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{c.email}</span>
                <span className="text-xs text-slate-500">
                  {designs} design{designs === 1 ? "" : "s"} · {c.consent?.optedIn ? "opted in" : "no consent"}
                </span>
              </div>
              <div className="mt-2">
                <CustomerNotes customerId={c.id} initialNotes={c.notes ?? ""} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
