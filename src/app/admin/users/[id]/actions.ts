"use server";

import { requireAdmin } from "@/lib/session";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  userRepository,
  sessionRepository,
  accountRepository,
} from "@/lib/repositories";
import { updateUserSchema } from "../shared";

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  username: string | null;
  displayUsername: string | null;
  createdAt: Date;
  updatedAt: Date;
  accounts: Array<{
    id: string;
    providerId: string;
    accountId: string;
    createdAt: Date;
  }>;
  sessions: Array<{
    id: string;
    userId: string;
    userEmail: string | null;
    userName: string | null;
    token: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    expiresAt: Date;
    updatedAt: Date;
  }>;
}

/**
 * Get user by ID with accounts and sessions
 */
export async function getUserById(userId: string): Promise<UserDetail | null> {
  try {
    await requireAdmin();

    // Get user with accounts
    const userWithAccounts = await userRepository.findByIdWithAccounts(userId);
    if (!userWithAccounts) {
      return null;
    }

    // Get detailed accounts
    const detailedAccounts = await accountRepository.findByUserId(userId);

    // Get sessions with token (for revocation)
    const sessions = await sessionRepository.findByUserIdWithToken(userId);

    return {
      ...userWithAccounts,
      accounts: detailedAccounts,
      sessions,
    };
  } catch (error) {
    console.error("Failed to fetch user:", error);
    return null;
  }
}

export interface UpdateUserState {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
}

/**
 * Update user profile (admin can update any user)
 */
export async function updateUserProfile(
  userId: string,
  prevState: UpdateUserState,
  formData: FormData
): Promise<UpdateUserState> {
  try {
    await requireAdmin();

    const data = {
      name: formData.get("name") as string,
      username: formData.get("username") as string,
      displayUsername: formData.get("displayUsername") as string,
    };

    const validated = updateUserSchema.safeParse(data);

    if (!validated.success) {
      const errors: Record<string, string> = {};
      validated.error.issues.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      return { success: false, errors };
    }

    // Update user in database
    await userRepository.update(userId, {
      name: validated.data.name,
      username: validated.data.username || null,
      displayUsername: validated.data.displayUsername || null,
    });
    // Note: Webhook event is automatically emitted by WebhookAwareRepository

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    console.error("Failed to update user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user",
    };
  }
}

/**
 * Toggle email verification status
 */
export async function toggleEmailVerification(
  userId: string,
  verified: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    await userRepository.update(userId, {
      emailVerified: verified,
    });
    // Note: Webhook event is automatically emitted by WebhookAwareRepository

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    console.error("Failed to update verification status:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update verification",
    };
  }
}

/**
 * Unlink OAuth account
 */
export async function unlinkAccount(
  accountId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    await accountRepository.delete(accountId);

    revalidatePath(`/admin/users/${userId}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to unlink account:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to unlink account",
    };
  }
}

/**
 * Revoke specific session
 */
export async function revokeUserSession(
  sessionToken: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    await auth.api.revokeSession({
      body: { token: sessionToken },
      headers: await headers(),
    });

    revalidatePath(`/admin/users/${userId}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to revoke session:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke session",
    };
  }
}

/**
 * Force logout all user sessions
 */
export async function forceLogoutUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    await sessionRepository.deleteByUserId(userId);

    revalidatePath(`/admin/users/${userId}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to force logout:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to force logout",
    };
  }
}

/**
 * Admin force set user password
 */
export async function setUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    if (!newPassword || newPassword.length < 8) {
      return {
        success: false,
        error: "Password must be at least 8 characters long",
      };
    }

    await auth.api.setUserPassword({
      body: {
        userId,
        newPassword,
      },
      headers: await headers(),
    });

    revalidatePath(`/admin/users/${userId}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to set user password:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to set password",
    };
  }
}

/**
 * Send password reset email to user
 */
export async function sendPasswordResetEmail(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (process.env.SKIP_EMAIL_SENDING === 'true') {
      return { success: true };
    }

    // Get user to retrieve email
    const user = await userRepository.findById(userId);
    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }

    await auth.api.requestPasswordReset({
      body: {
        email: user.email,
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password`,
      },
      headers: await headers(),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send reset email",
    };
  }
}
