import MagicLoginForm from "@/components/MagicLoginForm";

export const dynamic = "force-dynamic";

export default function BuilderLoginPage() {
  return (
    <div className="py-8">
      <MagicLoginForm
        endpoint="/api/builder/auth/magic"
        title="Builder sign-in"
        subtitle="Enter the email on your account. We'll send a one-time sign-in link (no password)."
      />
      <p className="mx-auto mt-4 max-w-md text-center text-sm text-slate-500">
        New here? <a href="/onboarding" className="text-brand hover:underline">Create your configurator →</a>
      </p>
    </div>
  );
}
