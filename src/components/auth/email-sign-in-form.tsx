"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  emailPasswordSignIn,
  emailSignInInitialState,
} from "@/app/sign-in/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="w-full rounded-md bg-black px-4 py-2 text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-600"
      disabled={pending}
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export function EmailSignInForm() {
  const [state, action] = useFormState(emailPasswordSignIn, emailSignInInitialState);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium text-gray-200">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
          placeholder="admin@example.com"
          autoComplete="email"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-gray-200">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-red-400">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-400">You are signed in.</p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

