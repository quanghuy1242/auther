"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!token) {
      return {
        success: false,
        error: "Missing password reset token",
      };
    }

    if (!newPassword || newPassword.length < 8) {
      return {
        success: false,
        error: "Password must be at least 8 characters long",
      };
    }

    await auth.api.resetPassword({
      body: {
        newPassword,
        token,
      },
      headers: await headers(),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to reset password:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reset password",
    };
  }
}
