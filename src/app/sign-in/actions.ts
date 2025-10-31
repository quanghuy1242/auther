"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { UserRepository } from "@/lib/repositories/user-repository";

export type EmailSignInState = {
  success: boolean;
  error?: string;
  redirectUrl?: string;
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

    // Check if user has admin role by querying the database
    // I have no idea why better-auth doesn't include role in the user object
    const userRepo = new UserRepository();
    const user = await userRepo.findById(result.user.id);
    const isAdmin = user?.role === "admin";
    
    const hasRedirect = 
      (typeof authorizeQuery === "string" && authorizeQuery.length > 0) ||
      (result.redirect && result.url) ||
      (typeof callbackUrl === "string" && callbackUrl.length > 0);

    // Non-admin users MUST have a redirect URL (OIDC flow)
    if (!isAdmin && !hasRedirect) {
      try {
        await auth.api.signOut({
          headers: await headers(),
        });
      } catch (error) {
        console.error("Failed to sign out user:", error);
      }
      
      return {
        success: false,
        error: "Access denied. Regular users can only sign in through authorized applications.",
      };
    }

    // Handle OIDC authorization flow
    if (typeof authorizeQuery === "string" && authorizeQuery.length > 0) {
      return {
        success: true,
        redirectUrl: `/api/auth/oauth2/authorize?${authorizeQuery}`,
      };
    }

    // Handle other redirect URLs
    if (result.redirect && result.url) {
      return {
        success: true,
        redirectUrl: result.url,
      };
    }

    // Admin users can access the dashboard
    if (isAdmin) {
      return {
        success: true,
        redirectUrl: "/admin",
      };
    }

    // This shouldn't be reached, but fallback error
    return {
      success: false,
      error: "No valid redirect destination found.",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to sign in with the provided credentials.",
    };
  }
}
