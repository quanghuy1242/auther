"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";

import { emailPasswordSignIn } from "@/app/sign-in/actions";
import type { EmailSignInState } from "@/app/sign-in/actions";
import { Input, Button } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="primary"
      className="w-full"
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

export function EmailSignInForm() {
  const [state, action] = useFormState(emailPasswordSignIn, INITIAL_STATE);
  const searchParams = useSearchParams();
  const authorizeQuery = searchParams.toString();
  const callbackUrl =
    searchParams.get("callback_url") ??
    searchParams.get("callbackURL") ??
    searchParams.get("redirect") ??
    searchParams.get("redirect_url") ??
    searchParams.get("redirectURL") ??
    searchParams.get("return_url") ??
    searchParams.get("returnUrl") ??
    undefined;

  useEffect(() => {
    if (state.redirectUrl) {
      window.location.assign(state.redirectUrl);
    }
  }, [state.redirectUrl]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="authorizeQuery" value={authorizeQuery} />
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      
      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        placeholder="admin@example.com"
        autoComplete="email"
        required
      />
      
      <Input
        id="password"
        name="password"
        type="password"
        label="Password"
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />
      
      {state.error ? (
        <p className="text-sm text-red-400">{state.error}</p>
      ) : null}
      {state.error ? null : state.redirectUrl ? (
        <p className="text-sm text-emerald-400">Redirecting…</p>
      ) : state.success ? (
        <p className="text-sm text-emerald-400">You are signed in.</p>
      ) : null}
      
      <SubmitButton />
    </form>
  );
}
