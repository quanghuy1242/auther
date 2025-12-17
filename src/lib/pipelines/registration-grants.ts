/**
 * Registration Context Grants
 * 
 * Applies permission grants from registration contexts after user creation.
 * This is called from the better-auth user.create.after hook.
 */

import { registrationContextService } from "@/lib/services/registration-context-service";
import {
    platformInviteRepo,
    registrationContextRepo,
} from "@/lib/repositories/platform-access-repository";

// In-memory store for pending registration context (set during sign-up flow)
// This is a simple approach; a more robust solution would use session storage
const pendingContextGrants = new Map<string, {
    contextSlug: string;
    inviteId?: string;
}>();

/**
 * Queue a registration context to be applied when a user is created.
 * Call this during the sign-up flow before user creation.
 */
export function queueContextGrant(
    email: string,
    contextSlug: string,
    inviteId?: string
): void {
    pendingContextGrants.set(email.toLowerCase(), {
        contextSlug,
        inviteId,
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
    const pending = pendingContextGrants.get(normalizedEmail);

    if (!pending) {
        // No pending context for this user - they signed up without a context
        // This is normal for users who signed up before the new system
        return;
    }

    try {
        // Get the registration context directly
        const registrationContext = await registrationContextRepo.findBySlug(
            pending.contextSlug
        );

        if (!registrationContext) {
            console.error(
                `Registration context not found: ${pending.contextSlug}`
            );
            return;
        }

        // Apply the grants from the context
        await registrationContextService.applyContextGrants(
            registrationContext,
            userId
        );

        console.log(
            `Applied registration context grants: ${pending.contextSlug} -> user ${userId}`
        );

        // If this was from an invite, mark it as consumed
        if (pending.inviteId) {
            await platformInviteRepo.markConsumed(pending.inviteId, userId);
            console.log(`Consumed invite: ${pending.inviteId}`);
        }
    } catch (error) {
        console.error("Failed to apply registration context grants:", error);
        throw error;
    } finally {
        // Clean up the pending grant
        pendingContextGrants.delete(normalizedEmail);
    }
}

/**
 * Check if a user has a pending context grant.
 * Useful for debugging.
 */
export function hasPendingContextGrant(email: string): boolean {
    return pendingContextGrants.has(email.toLowerCase());
}

/**
 * Clear a pending context grant without applying it.
 * Useful for cleanup on sign-up failure.
 */
export function clearPendingContextGrant(email: string): void {
    pendingContextGrants.delete(email.toLowerCase());
}
