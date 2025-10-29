"use server";

import { db } from "@/lib/db";
import { user as userTable, account as accountTable, session as sessionTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/session";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
    token: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }>;
}

const updateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal("")),
  displayUsername: z.string().min(2, "Display username must be at least 2 characters").optional().or(z.literal("")),
});

/**
 * Get user by ID with accounts and sessions
 */
export async function getUserById(userId: string): Promise<UserDetail | null> {
  try {
    await requireAuth();

    // Get user
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!user) {
      return null;
    }

    // Get accounts
    const accounts = await db
      .select()
      .from(accountTable)
      .where(eq(accountTable.userId, userId))
      .orderBy(desc(accountTable.createdAt));

    // Get sessions
    const sessions = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.userId, userId))
      .orderBy(desc(sessionTable.createdAt));

    return {
      ...user,
      accounts: accounts.map((acc) => ({
        id: acc.id,
        providerId: acc.providerId,
        accountId: acc.accountId,
        createdAt: acc.createdAt,
      })),
      sessions: sessions.map((sess) => ({
        id: sess.id,
        token: sess.token,
        expiresAt: sess.expiresAt,
        ipAddress: sess.ipAddress,
        userAgent: sess.userAgent,
        createdAt: sess.createdAt,
      })),
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
    await requireAuth();

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
    await db
      .update(userTable)
      .set({
        name: validated.data.name,
        username: validated.data.username || null,
        displayUsername: validated.data.displayUsername || null,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, userId));

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
    await requireAuth();

    await db
      .update(userTable)
      .set({
        emailVerified: verified,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, userId));

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    console.error("Failed to update verification status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update verification",
    };
  }
}

/**
 * Unlink OAuth account
 */
export async function unlinkAccount(accountId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();

    // Delete the account
    await db
      .delete(accountTable)
      .where(eq(accountTable.id, accountId));

    revalidatePath(`/admin/users/${userId}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to unlink account:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unlink account",
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
    await requireAuth();

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
export async function forceLogoutUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();

    // Delete all sessions for this user
    await db
      .delete(sessionTable)
      .where(eq(sessionTable.userId, userId));

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
