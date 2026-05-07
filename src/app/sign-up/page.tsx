import type { Metadata } from "next";

import { SignUpForm } from "./sign-up-form";
import { Card, CardContent, Icon } from "@/components/ui";
import { getSession } from "@/lib/session";
import { signupPolicyRepo } from "@/lib/repositories/platform-access-repository";

export const metadata: Metadata = {
  title: "Sign up",
};

export const dynamic = "force-dynamic";

interface SignUpPageProps {
  searchParams: Promise<{
    token?: string | string[];
    intent?: string | string[];
    invite?: string | string[];
  }>;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const intent = firstParam(params.intent) || firstParam(params.token);
  const invite = firstParam(params.invite);
  const [session, policy] = await Promise.all([
    getSession(),
    signupPolicyRepo.get(),
  ]);

  const formMode = intent
    ? "intent"
    : invite
      ? "invite"
      : policy.directSignupEnabled
        ? "direct"
        : null;

  const blockedMessage = "Signup is only available from an approved application.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111921] px-4 py-16">
      <Card className="w-full max-w-md shadow-2xl">
        <CardContent className="pt-10">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1773cf]/20">
              <Icon name="person_add" size="xl" className="text-[#1773cf]" filled />
            </div>
          </div>

          <header className="mb-8 space-y-3 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Create account
            </h1>
            <p className="text-sm leading-6 text-gray-400">
              Use the email address you want associated with this access.
            </p>
          </header>

          {formMode ? (
            <SignUpForm
              mode={formMode}
              token={intent || invite || undefined}
              sessionUser={session ? { name: session.user.name, email: session.user.email } : undefined}
            />
          ) : (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {blockedMessage}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
