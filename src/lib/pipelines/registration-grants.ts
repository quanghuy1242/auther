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

// In-memory store for pending registration contexts (set during sign-up flow)
// Supports multiple contexts per email (e.g., global platform + client-specific)
const pendingContextGrants = new Map<string, Array<{
    contextSlug: string;
    inviteId?: string;
}>>();

/**
 * Queue a registration context to be applied when a user is created.
 * Call this during the sign-up flow before user creation.
 */
export function queueContextGrant(
    email: string,
    contextSlug: string,
    inviteId?: string
): void {
    const normalizedEmail = email.toLowerCase();
    const existing = pendingContextGrants.get(normalizedEmail) || [];
    // Avoid duplicates - don't queue the same context twice
    if (!existing.some(g => g.contextSlug === contextSlug)) {
        existing.push({ contextSlug, inviteId });
        pendingContextGrants.set(normalizedEmail, existing);
    }
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
    const pendingList = pendingContextGrants.get(normalizedEmail);

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
        }
    } catch (error) {
        console.error("Failed to apply registration context grants:", error);
        throw error;
    } finally {
        // Clean up all pending grants for this email
        pendingContextGrants.delete(normalizedEmail);
    }
}

/**
 * Apply registration context grants for an existing user during OAuth authorization.
 * This is called when an existing user authorizes through an OAuth client
 * that has registration contexts configured.
 * 
 * Applies BOTH:
 * 1. Client-specific contexts (contexts owned by the client)
 * 2. Global platform contexts (contexts with clientId = null)
 * 
 * This is idempotent - if the user already has the grants, nothing happens.
 */
export async function applyClientContextGrants(
    clientId: string,
    userId: string
): Promise<void> {
    // 1. Find and apply client-specific registration contexts
    const clientContexts = await registrationContextRepo.findByClientId(clientId);

    for (const context of clientContexts) {
        if (!context.enabled) continue;

        try {
            await registrationContextService.applyContextGrants(context, userId);
            console.log(
                `Applied client context grants: ${context.slug} -> user ${userId}`
            );
        } catch (error) {
            console.error(
                `Failed to apply client context grants for ${context.slug}:`,
                error
            );
            // Continue with other contexts even if one fails
        }
    }

    // 2. Find and apply global platform contexts (clientId = null)
    const platformContexts = await registrationContextRepo.findPlatformContexts();

    for (const context of platformContexts) {
        if (!context.enabled) continue;

        try {
            await registrationContextService.applyContextGrants(context, userId);
            console.log(
                `Applied platform context grants: ${context.slug} -> user ${userId}`
            );
        } catch (error) {
            console.error(
                `Failed to apply platform context grants for ${context.slug}:`,
                error
            );
            // Continue with other contexts even if one fails
        }
    }
}

/**
 * Check if a user has a pending context grant.
 * Useful for debugging.
 */
export function hasPendingContextGrant(email: string): boolean {
    const pending = pendingContextGrants.get(email.toLowerCase());
    return pending !== undefined && pending.length > 0;
}

/**
 * Clear a pending context grant without applying it.
 * Useful for cleanup on sign-up failure.
 */
export function clearPendingContextGrant(email: string): void {
    pendingContextGrants.delete(email.toLowerCase());
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
        queueContextGrant(email, context.slug);
    }
}
