"use server";

import { auth } from "@/lib/auth";

export type EmailSignInState = {
  success: boolean;
  error?: string;
};

export async function emailPasswordSignIn(
  _: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return {
      success: false,
      error: "Email and password are required.",
    };
  }

  try {
    await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to sign in with the provided credentials.",
    };
  }

  return {
    success: true,
  };
}
