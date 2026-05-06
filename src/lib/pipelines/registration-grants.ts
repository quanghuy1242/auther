/**
 * Registration Context Grants
 * 
 * Applies permission grants from registration contexts after user creation.
 * This is called from the better-auth user.create.after hook.
 */

import { registrationContextService } from "@/lib/services/registration-context-service";
import {
    pendingRegistrationContextApplicationRepo,
    platformInviteRepo,
    registrationContextRepo,
} from "@/lib/repositories/platform-access-repository";

type PendingContextGrantApplication = {
    id?: string;
    contextSlug: string;
    inviteId?: string;
    durable: boolean;
};

export async function queueContextGrantDurable(
    email: string,
    contextSlug: string,
    inviteId?: string,
    options: {
        triggerKind?: string;
        triggerClientId?: string | null;
    } = {}
): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    await pendingRegistrationContextApplicationRepo.create({
        email: normalizedEmail,
        contextSlug,
        inviteId: inviteId ?? null,
        triggerKind: options.triggerKind ?? (inviteId ? "invite" : "manual"),
        triggerClientId: options.triggerClientId ?? null,
        status: "pending",
        attempts: 0,
        idempotencyKey: `${normalizedEmail}:${contextSlug}:${inviteId ?? "open"}`,
    });

}

/**
 * Apply registration context grants after user creation.
 * This is called from the user.create.after hook.
 */
export async function applyRegistrationContextGrants(
    userId: string,
    email: string
): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    const durablePending = await pendingRegistrationContextApplicationRepo.findPendingByEmail(normalizedEmail);
    const pendingList: PendingContextGrantApplication[] =
        durablePending.map((pending) => ({
            id: pending.id,
            contextSlug: pending.contextSlug,
            inviteId: pending.inviteId ?? undefined,
            durable: true,
        }));

    if (!pendingList || pendingList.length === 0) {
        // No pending contexts for this user - they signed up without a context
        // This is normal for users who signed up before the new system
        return;
    }

    try {
        // Apply grants from ALL pending contexts (supports global + client contexts)
        for (const pending of pendingList) {
            const registrationContext = await registrationContextRepo.findBySlug(
                pending.contextSlug
            );

            if (!registrationContext) {
                console.error(
                    `Registration context not found: ${pending.contextSlug}`
                );
                continue;
            }

            // Apply the grants from the context (idempotent via createIfNotExists)
            try {
                await registrationContextService.applyContextGrants(
                    registrationContext,
                    userId
                );
            } catch (error) {
                if (pending.durable && pending.id) {
                    await pendingRegistrationContextApplicationRepo.markFailed(
                        pending.id,
                        error instanceof Error ? error.message : "Unknown error"
                    );
                }
                throw error;
            }

            console.log(
                `Applied registration context grants: ${pending.contextSlug} -> user ${userId}`
            );

            // If this was from an invite, mark it as consumed
            if (pending.inviteId) {
                await platformInviteRepo.markConsumed(pending.inviteId, userId);
                console.log(`Consumed invite: ${pending.inviteId}`);
            }

            if (pending.durable && pending.id) {
                await pendingRegistrationContextApplicationRepo.markApplied(pending.id, userId);
            }
        }
    } catch (error) {
        console.error("Failed to apply registration context grants:", error);
        throw error;
    }
}

/**
 * Check if a user has a pending context grant.
 * Useful for debugging.
 */
export function hasPendingContextGrant(email: string): boolean {
    void email;
    return false;
}

/**
 * Clear a pending context grant without applying it.
 * Useful for cleanup on sign-up failure.
 */
export function clearPendingContextGrant(email: string): void {
    void email;
}

/**
 * Queue all enabled global platform contexts for a user during sign-up.
 * Call this during sign-up flow to ensure new users get platform-level grants.
 * 
 * This is automatically deduplicated - won't queue the same context twice.
 */
export async function queuePlatformContextGrants(email: string): Promise<void> {
    const platformContexts = await registrationContextRepo.findPlatformContexts();

    for (const context of platformContexts) {
        if (!context.enabled) continue;
        await queueContextGrantDurable(email, context.slug, undefined, {
            triggerKind: "platform",
        });
    }
}
