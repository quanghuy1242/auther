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

type SignInTheme = "default" | "blog";

interface SignInPageProps {
  searchParams: Promise<{
    theme?: string | string[];
  }>;
}

function resolveTheme(theme: string | string[] | undefined): SignInTheme {
  const candidate = Array.isArray(theme) ? theme[0] : theme;
  return candidate === "blog" ? "blog" : "default";
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  // Check if user is already authenticated and is an admin
  // This prevents redirect loops by only redirecting when we have a VALID admin session
  const session = await getSession();
  if (session) {
    const hasAdminAccess = await isAdmin(session);
    if (hasAdminAccess) {
      redirect("/admin");
    }
  }

  const params = await searchParams;
  const theme = resolveTheme(params.theme);
  const isBlogTheme = theme === "blog";

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
              <Icon name="lock" size="xl" className="text-[#416275]" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1773cf]/20">
                <Icon name="lock" size="xl" className="text-[#1773cf]" filled />
              </div>
            )}
          </div>

          <header className={isBlogTheme ? "mb-8 space-y-3 text-center" : "mb-8 space-y-3 text-center"}>
            <h1
              className={
                isBlogTheme
                  ? "text-2xl font-semibold tracking-tight text-slate-900"
                  : "text-2xl font-semibold tracking-tight text-white"
              }
            >
              Sign in
            </h1>
            <p
              className={
                isBlogTheme
                  ? "mx-auto max-w-md text-sm leading-6 text-slate-600"
                  : "text-sm text-gray-400"
              }
            >
              Enter your credentials to continue to the website.
            </p>
          </header>

          <section>
            <Suspense
              fallback={
                <p className={isBlogTheme ? "text-center text-sm text-slate-500" : "text-center text-sm text-gray-400"}>
                  Loading…
                </p>
              }
            >
              <EmailSignInForm theme={theme} />
            </Suspense>
          </section>

          {isBlogTheme ? (
            <p className="mt-6 border-t border-slate-100 pt-4 text-center text-sm leading-6 text-slate-500">
              If you do not have access yet, contact the author or site owner.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
