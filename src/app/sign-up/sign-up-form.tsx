"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { directSignUp, inviteSignUp, onboardingSignUp, type SignUpState } from "./actions";
import { Button, Input } from "@/components/ui";
import { toast } from "@/lib/toast";

const INITIAL_STATE: SignUpState = {
  success: false,
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending} isLoading={pending}>
      {pending ? "Working..." : label}
    </Button>
  );
}

export function SignUpForm({
  mode,
  token,
  sessionUser,
}: {
  mode: "direct" | "intent" | "invite";
  token?: string;
  sessionUser?: { name: string; email: string };
}) {
  const serverAction =
    mode === "direct"
      ? directSignUp
      : mode === "invite"
        ? inviteSignUp
        : onboardingSignUp;
  const [state, action] = useFormState(serverAction, INITIAL_STATE);
  const signedIn = !!sessionUser;

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
    <form action={action} className="space-y-4">
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
          <div className="rounded-md border border-[#1773cf]/30 bg-[#1773cf]/10 px-4 py-3 text-sm text-blue-100">
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
          />

          <Input
            id="email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            required
          />

          <Input
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="new-password"
            required
          />
        </>
      )}

      <SubmitButton label={signedIn ? "Continue" : "Create account"} />
    </form>
  );
}
