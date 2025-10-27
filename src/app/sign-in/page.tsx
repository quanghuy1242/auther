import type { Metadata } from "next";
import { Suspense } from "react";

import { EmailSignInForm } from "@/components/auth/email-sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-16 text-white">
      <div className="w-full max-w-md space-y-10 rounded-2xl border border-gray-800/70 bg-gray-900/70 p-10 shadow-2xl shadow-black/40 backdrop-blur">
        <header className="space-y-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-gray-400">
            If you know what you&apos;re doing, type in your email to sign in
          </p>
        </header>

        <section className="space-y-6">
          <div className="space-y-2">
            <Suspense fallback={<p className="text-sm text-gray-400">Loading…</p>}>
              <EmailSignInForm />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
