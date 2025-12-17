"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { guards } from "@/lib/auth/platform-guard";
import { getSession } from "@/lib/session";
import { createUserSchema } from "@/schemas/users";
import { TupleRepository } from "@/lib/repositories/tuple-repository";
import {
  policyTemplateRepo,
  platformInviteRepo,
  registrationContextRepo,
} from "@/lib/repositories/platform-access-repository";
import crypto from "crypto";

export type CreateUserState = {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
  data?: {
    userId: string;
    email: string;
    sendInvite: boolean;
  };
};

export async function createUser(
  _prevState: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  try {
    await guards.users.create();
    const session = await getSession();

    // Parse form data
    const rawData = Object.fromEntries(formData.entries());

    const result = createUserSchema.safeParse(rawData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      return { success: false, errors };
    }

    const { fullName, email, username, password, sendInvite = false } = result.data;

    // Get template and context from form data (not in schema)
    const templateId = formData.get("templateId") as string | null;
    const contextSlug = formData.get("contextSlug") as string | null;

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

    const userId = response.user.id;

    // Apply template permissions if selected
    if (templateId) {
      const template = await policyTemplateRepo.findById(templateId);
      if (template) {
        const tupleRepo = new TupleRepository();
        for (const perm of template.permissions) {
          const entityType = perm.entityType || "platform";
          await tupleRepo.createIfNotExists({
            entityType,
            entityId: "*",
            relation: perm.relation,
            subjectType: "user",
            subjectId: userId,
          });
        }
      }
    }

    // Store registration context association by creating a consumed pseudo-invite
    if (contextSlug && session?.user?.id) {
      const context = await registrationContextRepo.findBySlug(contextSlug);
      if (context) {
        // Create token and hash for record integrity
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        // Create invite record that's already consumed
        await platformInviteRepo.create({
          email,
          contextSlug,
          tokenHash,
          expiresAt: new Date(), // Already expired
          invitedBy: session.user.id,
        });

        // Get the invite we just created and mark it as consumed
        const invites = await platformInviteRepo.findByInviter(session.user.id);
        const ourInvite = invites.find(i => i.tokenHash === tokenHash);
        if (ourInvite) {
          await platformInviteRepo.markConsumed(ourInvite.id, userId);
        }
      }
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
        sendInvite,
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
