"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { directSignUp, inviteSignUp, onboardingSignUp, type SignUpState } from "./actions";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { toast } from "@/lib/toast";

type SignUpTheme = "default" | "blog";

const INITIAL_STATE: SignUpState = {
  success: false,
};

function SubmitButton({ label, theme }: { label: string; theme: SignUpTheme }) {
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
      {pending ? "Working..." : label}
    </Button>
  );
}

export function SignUpForm({
  mode,
  token,
  sessionUser,
  theme = "default",
}: {
  mode: "direct" | "intent" | "invite";
  token?: string;
  sessionUser?: { name: string; email: string };
  theme?: SignUpTheme;
}) {
  const serverAction =
    mode === "direct"
      ? directSignUp
      : mode === "invite"
        ? inviteSignUp
        : onboardingSignUp;
  const [state, action] = useFormState(serverAction, INITIAL_STATE);
  const signedIn = !!sessionUser;
  const isBlogTheme = theme === "blog";

  useEffect(() => {
    if (state.redirectUrl) {
      window.location.assign(state.redirectUrl);
      return;
    }

    if (state.error) {
      toast.error(state.error);
      return;
    }

    if (state.message) {
      toast.success(state.message);
    }
  }, [state]);

  return (
    <form action={action} className={cn("space-y-4", isBlogTheme && "mx-auto w-full max-w-md")}>
      {mode === "intent" && token ? (
        <input type="hidden" name="intent" value={token} />
      ) : null}
      {mode === "invite" && token ? (
        <input type="hidden" name="invite" value={token} />
      ) : null}
      {signedIn ? (
        <>
          <input type="hidden" name="name" value={sessionUser.name} />
          <input type="hidden" name="email" value={sessionUser.email} />
          <div
            className={cn(
              "rounded-md border border-[#1773cf]/30 bg-[#1773cf]/10 px-4 py-3 text-sm text-blue-100",
              isBlogTheme && "border-slate-200 bg-slate-50 text-slate-700"
            )}
          >
            Continue as {sessionUser.email}
          </div>
        </>
      ) : (
        <>
          <Input
            id="name"
            name="name"
            type="text"
            label="Name"
            autoComplete="name"
            required
            leftIcon={isBlogTheme ? "person" : undefined}
            containerClassName={cn(isBlogTheme && "space-y-1.5 [&_label]:text-slate-700")}
            className={cn(
              isBlogTheme &&
                "h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#416275] focus-visible:ring-0"
            )}
          />

          <Input
            id="email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            required
            leftIcon={isBlogTheme ? "email" : undefined}
            containerClassName={cn(isBlogTheme && "space-y-1.5 [&_label]:text-slate-700")}
            className={cn(
              isBlogTheme &&
                "h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#416275] focus-visible:ring-0"
            )}
          />

          <Input
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="new-password"
            required
            leftIcon={isBlogTheme ? "lock" : undefined}
            containerClassName={cn(isBlogTheme && "space-y-1.5 [&_label]:text-slate-700")}
            className={cn(
              isBlogTheme &&
                "h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#416275] focus-visible:ring-0"
            )}
          />
        </>
      )}

      <SubmitButton label={signedIn ? "Continue" : "Create account"} theme={theme} />
    </form>
  );
}
