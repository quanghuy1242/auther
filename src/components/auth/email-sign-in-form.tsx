"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import { emailPasswordSignIn } from "@/app/sign-in/actions";
import type { EmailSignInState } from "@/app/sign-in/actions";
import { Input, Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { toast } from "@/lib/toast";

type SignInTheme = "default" | "blog";

function SubmitButton({ theme }: { theme: SignInTheme }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="primary"
      className={cn(
        "w-full",
        theme === "blog" && "h-11 rounded-xl bg-[#416275] text-white hover:bg-[#3a5a6b] focus-visible:outline-[#416275]"
      )}
      disabled={pending}
      isLoading={pending}
    >
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

const INITIAL_STATE: EmailSignInState = {
  success: false,
  redirectUrl: undefined,
};

export function EmailSignInForm({ theme = "default" }: { theme?: SignInTheme }) {
  const [state, action] = useFormState(emailPasswordSignIn, INITIAL_STATE);
  const searchParams = useSearchParams();
  const isBlogTheme = theme === "blog";

  // Only capture as OAuth authorize query if client_id is present (actual OIDC flow)
  const isOAuthFlow = searchParams.has("client_id");
  const authorizeQuery = isOAuthFlow ? searchParams.toString() : "";

  const callbackUrl =
    searchParams.get("redirectTo") ??
    searchParams.get("callback_url") ??
    searchParams.get("callbackURL") ??
    searchParams.get("redirect") ??
    searchParams.get("redirect_url") ??
    searchParams.get("redirectURL") ??
    searchParams.get("return_url") ??
    searchParams.get("returnUrl") ??
    undefined;

  const errorParam = searchParams.get("error");
  const errorMessage = errorParam === "forbidden"
    ? "Access denied. You don't have permission to access the admin dashboard."
    : null;

  useEffect(() => {
    if (state.redirectUrl) {
      window.location.assign(state.redirectUrl);
    } else if (state.error) {
      toast.error(state.error);
    } else if (state.success) {
      toast.success("You are signed in");
    }
  }, [state.redirectUrl, state.error, state.success]);

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [errorMessage]);

  return (
    <form action={action} className={cn("space-y-4", isBlogTheme && "mx-auto w-full max-w-md")}>
      <input type="hidden" name="authorizeQuery" value={authorizeQuery} />
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />

      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        placeholder={isBlogTheme ? "you@example.com" : "admin@example.com"}
        autoComplete="email"
        required
        leftIcon={isBlogTheme ? "email" : undefined}
        containerClassName={cn(isBlogTheme && "space-y-1.5 [&_label]:text-slate-700")}
        className={cn(
          isBlogTheme &&
            "h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-0 focus-visible:border-[#416275]"
        )}
      />

      <Input
        id="password"
        name="password"
        type="password"
        label="Password"
        placeholder="••••••••"
        autoComplete="current-password"
        required
        leftIcon={isBlogTheme ? "lock" : undefined}
        containerClassName={cn(isBlogTheme && "space-y-1.5 [&_label]:text-slate-700")}
        className={cn(
          isBlogTheme &&
            "h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-0 focus-visible:border-[#416275]"
        )}
      />

      <SubmitButton theme={theme} />
    </form>
  );
}
