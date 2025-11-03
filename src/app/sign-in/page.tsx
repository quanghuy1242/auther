import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { EmailSignInForm } from "@/components/auth/email-sign-in-form";
import { Card, CardContent, Icon } from "@/components/ui";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: "Sign in",
};

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  // Check if user is already authenticated and is an admin
  // This prevents redirect loops by only redirecting when we have a VALID admin session
  const session = await getSession();
  if (session) {
    const hasAdminAccess = await isAdmin(session);
    if (hasAdminAccess) {
      redirect("/admin");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111921] px-4 py-16">
      <Card className="w-full max-w-md shadow-2xl">
        <CardContent className="pt-10">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-[#1773cf]/20 flex items-center justify-center">
              <Icon name="lock" size="xl" className="text-[#1773cf]" filled />
            </div>
          </div>
          
          <header className="space-y-3 text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Sign in</h1>
            <p className="text-sm text-gray-400">
              Enter your credentials to access the admin panel
            </p>
          </header>

          <section>
            <Suspense fallback={<p className="text-sm text-gray-400 text-center">Loading…</p>}>
              <EmailSignInForm />
            </Suspense>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
