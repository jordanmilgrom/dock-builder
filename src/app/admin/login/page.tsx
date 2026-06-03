import MagicLoginForm from "@/components/MagicLoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div className="py-8">
      <MagicLoginForm
        endpoint="/api/admin/auth/magic"
        title="Platform admin sign-in"
        subtitle="Restricted to platform administrators. We'll email a one-time sign-in link."
      />
    </div>
  );
}
