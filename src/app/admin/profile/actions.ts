"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { user as userTable, session as sessionTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, type SessionInfo } from "@/lib/session";
import { revalidatePath } from "next/cache";

const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal("")),
  displayUsername: z.string().min(2, "Display username must be at least 2 characters").optional().or(z.literal("")),
});

export interface UpdateProfileState {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
}

/**
 * Update user profile
 */
export async function updateProfile(
  prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  try {
    const { user } = await requireAuth();

    const data = {
      name: formData.get("name") as string,
      username: formData.get("username") as string,
      displayUsername: formData.get("displayUsername") as string,
    };

    const validated = updateProfileSchema.safeParse(data);

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
      .where(eq(userTable.id, user.id));

    revalidatePath("/admin/profile");

    return { success: true };
  } catch (error) {
    console.error("Failed to update profile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update profile",
    };
  }
}

/**
 * Get all user sessions
 */
export async function getUserSessions(userId?: string): Promise<SessionInfo[]> {
  try {
    // If userId not provided, fetch from auth
    const finalUserId = userId || (await requireAuth()).user.id;

    const sessions = await db
      .select({
        id: sessionTable.id,
        userId: sessionTable.userId,
        expiresAt: sessionTable.expiresAt,
        token: sessionTable.token,
        ipAddress: sessionTable.ipAddress,
        userAgent: sessionTable.userAgent,
        createdAt: sessionTable.createdAt,
        updatedAt: sessionTable.updatedAt,
      })
      .from(sessionTable)
      .where(eq(sessionTable.userId, finalUserId))
      .orderBy(desc(sessionTable.createdAt));

    return sessions;
  } catch (error) {
    console.error("Failed to fetch user sessions:", error);
    return [];
  }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();

    // Delete the session
    await db
      .delete(sessionTable)
      .where(eq(sessionTable.id, sessionId));

    revalidatePath("/admin/profile");

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
 * Revoke all other sessions except current
 */
export async function revokeAllOtherSessions(): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireAuth();

    // Delete all sessions except the current one
    await db
      .delete(sessionTable)
      .where(eq(sessionTable.userId, user.id));

    revalidatePath("/admin/profile");

    return { success: true };
  } catch (error) {
    console.error("Failed to revoke sessions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke sessions",
    };
  }
}
