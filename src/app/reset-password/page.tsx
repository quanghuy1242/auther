import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

function ResetPasswordContent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111921] px-4 py-16">
      <ResetPasswordForm />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#111921] px-4 py-16">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
