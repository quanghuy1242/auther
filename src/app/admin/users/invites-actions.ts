"use server";

import { guards } from "@/lib/auth/platform-guard";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
    platformInviteRepo,
    registrationContextRepo,
    type PlatformInvite,
    type RegistrationContext,
} from "@/lib/repositories/platform-access-repository";
import crypto from "crypto";

// Re-export types
export type { PlatformInvite, RegistrationContext };

export interface InviteWithContext extends PlatformInvite {
    contextName?: string;
}

// ============================================================================
// Platform Invites
// ============================================================================

export async function getPlatformInvites(): Promise<InviteWithContext[]> {
    await guards.users.view();

    // Get all contexts first
    const contexts = await registrationContextRepo.findPlatformContexts();
    const contextMap = new Map(contexts.map(c => [c.slug, c.name]));

    // Get invites for each context
    const allInvites: InviteWithContext[] = [];

    for (const context of contexts) {
        const invites = await platformInviteRepo.findPendingByContext(context.slug);
        for (const invite of invites) {
            allInvites.push({
                ...invite,
                contextName: contextMap.get(context.slug),
            });
        }
    }

    // Sort by createdAt descending
    allInvites.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return allInvites;
}

export async function getAvailableContexts(): Promise<RegistrationContext[]> {
    await guards.users.view();
    return registrationContextRepo.findPlatformContexts();
}

export async function createInvite(data: {
    email: string;
    contextSlug: string;
    expiresInDays?: number;
}): Promise<{ success: boolean; invite?: PlatformInvite; inviteUrl?: string; error?: string }> {
    try {
        await guards.users.create();
        const session = await getSession();

        if (!session?.user?.id) {
            return { success: false, error: "Not authenticated" };
        }

        // Verify context exists
        const context = await registrationContextRepo.findBySlug(data.contextSlug);
        if (!context) {
            return { success: false, error: "Registration context not found" };
        }

        // Generate token
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays || 7));

        const invite = await platformInviteRepo.create({
            email: data.email,
            contextSlug: data.contextSlug,
            tokenHash,
            expiresAt,
            invitedBy: session.user.id,
        });

        // Build invite URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const inviteUrl = `${baseUrl}/auth/register?invite=${token}`;

        revalidatePath("/admin/users");
        return { success: true, invite, inviteUrl };
    } catch (error) {
        console.error("createInvite error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create invite",
        };
    }
}

export async function deleteInvite(
    inviteId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.users.delete();

        await platformInviteRepo.delete(inviteId);

        revalidatePath("/admin/users");
        return { success: true };
    } catch (error) {
        console.error("deleteInvite error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete invite",
        };
    }
}
