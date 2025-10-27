"use server";

import { redirect } from "next/navigation";

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
  const authorizeQuery = formData.get("authorizeQuery");
  const callbackUrl = formData.get("callbackUrl");

  if (typeof email !== "string" || typeof password !== "string") {
    return {
      success: false,
      error: "Email and password are required.",
    };
  }

  try {
    const result = await auth.api.signInEmail({
      body: {
        email,
        password,
        callbackURL: typeof callbackUrl === "string" && callbackUrl.length > 0 ? callbackUrl : undefined,
      },
    });

    if (typeof authorizeQuery === "string" && authorizeQuery.length > 0) {
      redirect(`/api/auth/oauth2/authorize?${authorizeQuery}`);
    }

    if (result.redirect && result.url) {
      redirect(result.url);
    }
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
