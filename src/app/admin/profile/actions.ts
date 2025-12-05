"use server";

import { auth } from "@/lib/auth";
import { requireAuth, type SessionInfo } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { updateProfileSchema } from "@/schemas/profile";

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
    await requireAuth(); // Verify authentication

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

    // Update user via better-auth API
    const result = await auth.api.updateUser({
      body: {
        name: validated.data.name,
        username: validated.data.username || undefined,
        displayUsername: validated.data.displayUsername || undefined,
      },
      headers: await headers(),
    });

    if (!result) {
      return {
        success: false,
        error: "Failed to update user profile",
      };
    }

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
 * Uses better-auth API instead of direct database access
 */
export async function getUserSessions(): Promise<SessionInfo[]> {
  try {
    // Use better-auth API to list sessions
    const result = await auth.api.listSessions({
      headers: await headers(),
    });

    if (!result || !Array.isArray(result)) {
      return [];
    }

    // Transform to SessionInfo format
    return result.map((session) => ({
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      token: session.token,
      ipAddress: session.ipAddress || null,
      userAgent: session.userAgent || null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  } catch (error) {
    console.error("Failed to fetch user sessions:", error);
    return [];
  }
}

/**
 * Revoke a specific session
 * Uses better-auth API instead of direct database access
 */
export async function revokeSession(sessionToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();

    // Use better-auth API to revoke session
    await auth.api.revokeSession({
      body: { token: sessionToken },
      headers: await headers(),
    });

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
 * Uses better-auth API instead of direct database access
 */
export async function revokeAllOtherSessions(): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();

    // Use better-auth API to revoke other sessions
    await auth.api.revokeOtherSessions({
      headers: await headers(),
    });

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
