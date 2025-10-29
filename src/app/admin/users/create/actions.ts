"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/session";
import { auth } from "@/lib/auth";

const createUserSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  username: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  sendInvite: z.boolean().optional(),
});

export type CreateUserState = {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
  data?: {
    userId: string;
    email: string;
  };
};

export async function createUser(
  prevState: { success: boolean; errors?: Record<string, string>; data?: unknown },
  formData: FormData
): Promise<{ success: boolean; errors?: Record<string, string>; data?: unknown; error?: string }> {
  try {
    // Check admin auth
    await requireAuth();

    const rawData = {
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      username: formData.get("username"),
      password: formData.get("password"),
      sendInvite: formData.get("sendInvite") === "true",
    };

    const result = createUserSchema.safeParse(rawData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0].toString()] = issue.message;
        }
      });
      return { success: false, errors };
    }

    const { fullName, email, username, password, sendInvite } = result.data;

    // If sendInvite is true, create user without password (will need to set password via magic link)
    // Otherwise, use provided password or generate a temporary one
    const userPassword = sendInvite 
      ? `temp_${Math.random().toString(36).slice(2, 15)}_${Date.now()}`
      : (password || `temp_${Math.random().toString(36).slice(2, 15)}_${Date.now()}`);

    // Create user using better-auth signUpEmail
    const response = await auth.api.signUpEmail({
      body: {
        email,
        name: fullName,
        password: userPassword,
        username: username || undefined,
      },
    });

    if (!response) {
      return {
        success: false,
        error: "Failed to create user",
      };
    }

    // If sendInvite is true, trigger verification email
    if (sendInvite) {
      await auth.api.sendVerificationEmail({
        body: {
          email,
          callbackURL: `${process.env.BETTER_AUTH_URL}/sign-in`,
        },
      });
    }

    revalidatePath("/admin/users");

    return {
      success: true,
      data: {
        userId: response.user.id,
        email: response.user.email,
      },
    };
  } catch (error) {
    console.error("Create user error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

