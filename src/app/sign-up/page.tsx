import type { Metadata } from "next";

import { SignUpForm } from "./sign-up-form";
import { Card, CardContent, Icon } from "@/components/ui";
import { getSession } from "@/lib/session";
import { signupPolicyRepo } from "@/lib/repositories/platform-access-repository";
import { registrationContextService } from "@/lib/services/registration-context-service";

export const metadata: Metadata = {
  title: "Sign up",
};

export const dynamic = "force-dynamic";

type SignUpTheme = "default" | "blog";

interface SignUpPageProps {
  searchParams: Promise<{
    token?: string | string[];
    intent?: string | string[];
    invite?: string | string[];
    theme?: string | string[];
  }>;
}

function firstParam(value: string | string[] | null | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function resolveTheme(theme: string | string[] | null | undefined): SignUpTheme {
  const candidate = firstParam(theme).trim();
  return candidate === "blog" ? "blog" : "default";
}

async function resolveFlowTheme({
  intent,
  invite,
  queryTheme,
}: {
  intent: string;
  invite: string;
  queryTheme: string | string[] | undefined;
}): Promise<SignUpTheme> {
  const explicitTheme = resolveTheme(queryTheme);
  if (explicitTheme !== "default") {
    return explicitTheme;
  }

  const validation = intent
    ? await registrationContextService.validateSignupIntent(intent)
    : invite
      ? await registrationContextService.validateInvite(invite)
      : null;

  return resolveTheme(validation?.context?.theme);
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const intent = firstParam(params.intent) || firstParam(params.token);
  const invite = firstParam(params.invite);
  const theme = await resolveFlowTheme({ intent, invite, queryTheme: params.theme });
  const isBlogTheme = theme === "blog";
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
    <div
      className={
        isBlogTheme
          ? "flex min-h-screen items-center justify-center bg-white px-4 py-16"
          : "flex min-h-screen items-center justify-center bg-[#111921] px-4 py-16"
      }
    >
      <Card
        className={
          isBlogTheme
            ? "w-full max-w-xl rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-none"
            : "w-full max-w-md shadow-2xl"
        }
      >
        <CardContent className={isBlogTheme ? "px-6 py-6 sm:px-8" : "pt-10"}>
          <div className={isBlogTheme ? "mb-5 flex justify-center" : "mb-6 flex justify-center"}>
            {isBlogTheme ? (
              <Icon name="person_add" size="xl" className="text-[#416275]" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1773cf]/20">
                <Icon name="person_add" size="xl" className="text-[#1773cf]" filled />
              </div>
            )}
          </div>

          <header className="mb-8 space-y-3 text-center">
            <h1 className={isBlogTheme ? "text-2xl font-semibold tracking-tight text-slate-900" : "text-2xl font-semibold tracking-tight text-white"}>
              Create account
            </h1>
            <p className={isBlogTheme ? "mx-auto max-w-md text-sm leading-6 text-slate-600" : "text-sm leading-6 text-gray-400"}>
              Use the email address you want associated with this access.
            </p>
          </header>

          {formMode ? (
            <SignUpForm
              mode={formMode}
              token={intent || invite || undefined}
              sessionUser={session ? { name: session.user.name, email: session.user.email } : undefined}
              theme={theme}
            />
          ) : (
            <p
              className={
                isBlogTheme
                  ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  : "rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              }
            >
              {blockedMessage}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
