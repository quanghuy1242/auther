import { createHmac, randomBytes } from "crypto";
import {
    registrationContextRepo,
    platformInviteRepo,
    RegistrationContext,
    PlatformInvite,
} from "@/lib/repositories/platform-access-repository";
import { TupleRepository } from "@/lib/repositories/tuple-repository";
import { OAuthClientMetadataRepository } from "@/lib/repositories/oauth-client-metadata-repository";
import { authorizationModelRepository } from "@/lib/repositories";

const tupleRepo = new TupleRepository();
const metadataRepo = new OAuthClientMetadataRepository();

// Get HMAC secret from environment
const INVITE_SECRET = process.env.INVITE_HMAC_SECRET || "default-secret-change-me";

export interface InvitePayload {
    email?: string;
    contextSlug: string;
    invitedBy: string;
    expiresAt: number;
}

export interface SignedInviteResult {
    inviteId: string;
    token: string;
    url: string;
}

export interface ContextValidationResult {
    valid: boolean;
    context?: RegistrationContext;
    error?: string;
}

/**
 * Service for managing registration contexts and invites.
 */
export class RegistrationContextService {
    /**
     * Validate a registration context for open sign-up (origin-based).
     */
    async validateOpenContext(
        slug: string,
        origin: string
    ): Promise<ContextValidationResult> {
        const context = await registrationContextRepo.findBySlug(slug);

        if (!context) {
            return { valid: false, error: "Registration context not found" };
        }

        if (!context.enabled) {
            return { valid: false, error: "Registration context is disabled" };
        }

        // Check if this is an open context (has allowed origins)
        if (!context.allowedOrigins || context.allowedOrigins.length === 0) {
            return { valid: false, error: "This context requires a signed invite" };
        }

        // Validate origin
        if (!context.allowedOrigins.includes(origin)) {
            return { valid: false, error: "Sign-up not allowed from this origin" };
        }

        // If client-scoped, check if client allows registration contexts
        if (context.clientId) {
            const metadata = await metadataRepo.findByClientId(context.clientId);
            if (!metadata?.allowsRegistrationContexts) {
                return { valid: false, error: "Client does not allow registration contexts" };
            }
        }

        return { valid: true, context };
    }

    /**
     * Create a signed invite for a registration context.
     */
    async createSignedInvite(
        contextSlug: string,
        invitedBy: string,
        options: {
            email?: string;
            expiresInDays?: number;
        } = {}
    ): Promise<SignedInviteResult> {
        const context = await registrationContextRepo.findBySlug(contextSlug);
        if (!context) {
            throw new Error("Registration context not found");
        }

        if (!context.enabled) {
            throw new Error("Registration context is disabled");
        }

        // If client-scoped, check if client allows registration contexts
        if (context.clientId) {
            const metadata = await metadataRepo.findByClientId(context.clientId);
            if (!metadata?.allowsRegistrationContexts) {
                throw new Error("Client does not allow registration contexts");
            }
        }

        const expiresInDays = options.expiresInDays ?? 7;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        // Create payload
        const payload: InvitePayload = {
            email: options.email,
            contextSlug,
            invitedBy,
            expiresAt: expiresAt.getTime(),
        };

        // Generate token with random component
        const randomPart = randomBytes(16).toString("hex");
        const payloadString = JSON.stringify(payload);
        const signature = createHmac("sha256", INVITE_SECRET)
            .update(payloadString + randomPart)
            .digest("hex");

        const token = Buffer.from(
            JSON.stringify({ payload, random: randomPart, sig: signature })
        ).toString("base64url");

        // Store invite in database
        const invite = await platformInviteRepo.create({
            invitedBy,
            email: options.email,
            contextSlug,
            tokenHash: signature,
            expiresAt,
        });

        // Generate URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const url = `${baseUrl}/sign-up?invite=${token}`;

        return {
            inviteId: invite.id,
            token,
            url,
        };
    }

    /**
     * Validate and decode a signed invite token.
     */
    async validateInvite(
        token: string,
        signUpEmail?: string
    ): Promise<{
        valid: boolean;
        invite?: PlatformInvite;
        context?: RegistrationContext;
        error?: string;
    }> {
        try {
            // Decode token
            const decoded = JSON.parse(
                Buffer.from(token, "base64url").toString("utf-8")
            );
            const { payload, random, sig } = decoded as {
                payload: InvitePayload;
                random: string;
                sig: string;
            };

            // Verify signature
            const expectedSig = createHmac("sha256", INVITE_SECRET)
                .update(JSON.stringify(payload) + random)
                .digest("hex");

            if (sig !== expectedSig) {
                return { valid: false, error: "Invalid invite signature" };
            }

            // Check expiration
            if (Date.now() > payload.expiresAt) {
                return { valid: false, error: "Invite has expired" };
            }

            // Find invite in database
            const invite = await platformInviteRepo.findByTokenHash(sig);
            if (!invite) {
                return { valid: false, error: "Invite not found" };
            }

            // Check if already consumed
            if (invite.consumedAt) {
                return { valid: false, error: "Invite has already been used" };
            }

            // Check email lock
            if (payload.email && signUpEmail && payload.email !== signUpEmail) {
                return { valid: false, error: "This invite is for a different email address" };
            }

            // Get context
            const context = await registrationContextRepo.findBySlug(payload.contextSlug);
            if (!context) {
                return { valid: false, error: "Registration context not found" };
            }

            if (!context.enabled) {
                return { valid: false, error: "Registration context is disabled" };
            }

            return { valid: true, invite, context };
        } catch (error) {
            console.error("Invite validation error:", error);
            return { valid: false, error: "Invalid invite format" };
        }
    }

    /**
     * Apply grants from a registration context to a user.
     * This creates access_tuples for the new user.
     * Uses entityTypeId to look up current entity type name (survives renames).
     */
    async applyContextGrants(
        context: RegistrationContext,
        userId: string
    ): Promise<void> {
        for (const grant of context.grants) {
            // Look up authorization model by ID to get current entity type name
            const model = await authorizationModelRepository.findById(grant.entityTypeId);

            if (!model) {
                console.warn(`applyContextGrants: No model found for entityTypeId ${grant.entityTypeId}`);
                continue;
            }

            // Create tuple using the current (possibly renamed) entity type
            await tupleRepo.createIfNotExists({
                entityType: model.entityType, // e.g., "client_abc:invoice" (current name)
                entityTypeId: model.id, // Stable ID reference
                entityId: "*", // Wildcard for all entities of this type
                relation: grant.relation,
                subjectType: "user",
                subjectId: userId,
            });
        }
    }

    /**
     * Mark an invite as consumed after successful sign-up.
     */
    async consumeInvite(inviteId: string, userId: string): Promise<boolean> {
        return platformInviteRepo.markConsumed(inviteId, userId);
    }

    /**
     * Revoke an invite (delete it).
     */
    async revokeInvite(inviteId: string): Promise<boolean> {
        return platformInviteRepo.delete(inviteId);
    }

    /**
     * Get all pending invites for a context.
     */
    async getPendingInvites(contextSlug: string): Promise<PlatformInvite[]> {
        return platformInviteRepo.findPendingByContext(contextSlug);
    }

    /**
     * Get all contexts for a client.
     */
    async getClientContexts(clientId: string): Promise<RegistrationContext[]> {
        return registrationContextRepo.findByClientId(clientId);
    }

    /**
     * Get all platform contexts.
     */
    async getPlatformContexts(): Promise<RegistrationContext[]> {
        return registrationContextRepo.findPlatformContexts();
    }
}

// Export singleton instance
export const registrationContextService = new RegistrationContextService();
