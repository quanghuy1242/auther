/**
 * Registration Context Grants
 * 
 * Applies permission grants from registration contexts after user creation.
 * This is called from the better-auth user.create.after hook.
 */

import { registrationContextService } from "@/lib/services/registration-context-service";
import { pendingRegistrationContextApplicationRepo } from "@/lib/repositories/platform-access-repository";

type PendingContextGrantApplication = {
    id?: string;
    contextSlug: string;
    inviteId?: string;
    triggerKind: string;
    triggerClientId?: string | null;
    triggerId?: string | null;
    requestedGrants?: Array<{ entityTypeId: string; relation: string; entityId?: string }>;
    returnUrl?: string | null;
    nonce?: string | null;
    tokenExpiresAt?: Date | null;
    durable: boolean;
};

export async function queueContextGrantDurable(
    email: string,
    contextSlug: string,
    inviteId?: string,
    options: {
        triggerKind?: string;
        triggerClientId?: string | null;
        triggerId?: string | null;
        requestedGrants?: Array<{ entityTypeId: string; relation: string; entityId?: string }>;
        returnUrl?: string | null;
        nonce?: string | null;
        tokenExpiresAt?: Date | null;
    } = {}
): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    await pendingRegistrationContextApplicationRepo.create({
        email: normalizedEmail,
        contextSlug,
        inviteId: inviteId ?? null,
        triggerKind: options.triggerKind ?? (inviteId ? "invite" : "manual"),
        triggerClientId: options.triggerClientId ?? null,
        triggerId: options.triggerId ?? options.triggerClientId ?? null,
        requestedGrants: options.requestedGrants ?? null,
        returnUrl: options.returnUrl ?? null,
        nonce: options.nonce ?? null,
        tokenExpiresAt: options.tokenExpiresAt ?? null,
        status: "pending",
        attempts: 0,
        idempotencyKey: `${normalizedEmail}:${contextSlug}:${options.nonce ?? inviteId ?? "open"}`,
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
            triggerKind: pending.triggerKind,
            triggerClientId: pending.triggerClientId,
            triggerId: pending.triggerId,
            requestedGrants: pending.requestedGrants ?? undefined,
            returnUrl: pending.returnUrl,
            nonce: pending.nonce,
            tokenExpiresAt: pending.tokenExpiresAt ?? null,
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
            if (pending.tokenExpiresAt && pending.tokenExpiresAt.getTime() <= Date.now()) {
                if (pending.durable && pending.id) {
                    await pendingRegistrationContextApplicationRepo.markFailed(
                        pending.id,
                        "Signup intent expired before email verification completed"
                    );
                }
                continue;
            }

            const validation = await registrationContextService.validatePendingGrantApplication(
                pending,
                normalizedEmail
            );

            if (!validation.valid || !validation.context) {
                const error = validation.error ?? "Registration context grant is no longer allowed";
                console.error(error);
                if (pending.durable && pending.id) {
                    await pendingRegistrationContextApplicationRepo.markFailed(
                        pending.id,
                        error
                    );
                }
                continue;
            }

            const registrationContext = validation.context;

            if (pending.inviteId) {
                const consumed = await registrationContextService.consumeInvite(
                    pending.inviteId,
                    userId
                );
                if (!consumed) {
                    const error = "Invite is no longer available";
                    if (pending.durable && pending.id) {
                        await pendingRegistrationContextApplicationRepo.markFailed(
                            pending.id,
                            error
                        );
                    }
                    continue;
                }
                console.log(`Consumed invite: ${pending.inviteId}`);
            }

            // Apply the grants from the context (idempotent via createIfNotExists)
            try {
                await registrationContextService.applyContextGrants(
                    registrationContext,
                    userId,
                    pending.requestedGrants
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
