import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
    registrationContextRepo,
    platformInviteRepo,
    signupIntentNonceRepo,
    signupPolicyRepo,
    RegistrationContext,
    PlatformInvite,
} from "@/lib/repositories/platform-access-repository";
import { TupleRepository } from "@/lib/repositories/tuple-repository";
import { OAuthClientMetadataRepository } from "@/lib/repositories/oauth-client-metadata-repository";
import { AuthorizationModelRepository } from "@/lib/repositories/authorization-model-repository";
import { getAuthorizationModelOwnerClientId } from "@/lib/utils/registration-context-grants";
import { AuthorizationSpaceRepository } from "@/lib/repositories/authorization-space-repository";

const tupleRepo = new TupleRepository();
const metadataRepo = new OAuthClientMetadataRepository();
const authzModelRepo = new AuthorizationModelRepository(tupleRepo);
const authorizationSpaceRepo = new AuthorizationSpaceRepository();

// Get HMAC secret from environment
const INVITE_SECRET = process.env.INVITE_HMAC_SECRET || "default-secret-change-me";
const SIGNUP_INTENT_KIND = "signup_intent";
const DEFAULT_SIGNUP_INTENT_TTL_SECONDS = 15 * 60;
const MIN_SIGNUP_INTENT_TTL_SECONDS = 60;
const MAX_SIGNUP_INTENT_TTL_SECONDS = 15 * 60;

type TriggerPrincipal = { kind: "oauth_client" | "resource_server"; id: string };
type RequestedGrant = { entityTypeId: string; relation: string; entityId?: string };

export interface SignupIntentPayload {
    kind: typeof SIGNUP_INTENT_KIND;
    flow: string;
    trigger: TriggerPrincipal;
    authorizationSpaceId: string;
    requestedGrants?: RequestedGrant[];
    returnUrl: string;
    nonce: string;
    exp: number;
}

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

export interface SignupIntentValidationResult extends ContextValidationResult {
    payload?: SignupIntentPayload;
}

export interface AppliedContextGrantStats {
    appliedCount: number;
    projectedCount: number;
}

interface PendingGrantValidationInput {
    contextSlug: string;
    inviteId?: string;
    triggerKind: string;
    triggerClientId?: string | null;
    triggerId?: string | null;
    requestedGrants?: RequestedGrant[];
    returnUrl?: string | null;
    nonce?: string | null;
    tokenExpiresAt?: Date | null;
}

/**
 * Service for managing registration contexts and invites.
 */
export class RegistrationContextService {
    private assertProductionInviteSecret(): void {
        if (
            process.env.NODE_ENV === "production" &&
            (!process.env.INVITE_HMAC_SECRET ||
                process.env.INVITE_HMAC_SECRET === "default-secret-change-me")
        ) {
            throw new Error("INVITE_HMAC_SECRET must be configured in production");
        }
    }

    private signPayload(payload: object, random: string): string {
        this.assertProductionInviteSecret();
        return createHmac("sha256", INVITE_SECRET)
            .update(JSON.stringify(payload) + random)
            .digest("hex");
    }

    private signaturesEqual(actual: string, expected: string): boolean {
        const actualBuffer = Buffer.from(actual, "hex");
        const expectedBuffer = Buffer.from(expected, "hex");
        return actualBuffer.length === expectedBuffer.length &&
            timingSafeEqual(actualBuffer, expectedBuffer);
    }

    private isTriggerAllowed(
        trigger: TriggerPrincipal,
        allowed: Array<{ kind: string; id: string }> | null | undefined
    ): boolean {
        return !!allowed?.some((candidate) =>
            candidate.kind === trigger.kind && candidate.id === trigger.id
        );
    }

    private isReturnUrlAllowed(returnUrl: string, allowedReturnUrls: string[] | null | undefined): boolean {
        if (!allowedReturnUrls || allowedReturnUrls.length === 0) {
            return false;
        }

        let parsed: URL;
        try {
            parsed = new URL(returnUrl);
        } catch {
            return false;
        }

        return allowedReturnUrls.some((allowed) => {
            try {
                const allowedUrl = new URL(allowed);
                const allowedPath = allowedUrl.pathname.endsWith("/")
                    ? allowedUrl.pathname
                    : `${allowedUrl.pathname}/`;
                return parsed.origin === allowedUrl.origin &&
                    (
                        parsed.pathname === allowedUrl.pathname ||
                        parsed.pathname.startsWith(allowedPath)
                    );
            } catch {
                return false;
            }
        });
    }

    private isEmailDomainAllowed(email: string, allowedDomains: string[] | null | undefined): boolean {
        if (!allowedDomains || allowedDomains.length === 0) {
            return true;
        }

        const domain = email.toLowerCase().split("@")[1];
        if (!domain) {
            return false;
        }

        return allowedDomains.some((allowedDomain) =>
            allowedDomain.toLowerCase().replace(/^@/, "") === domain
        );
    }

    private grantsAreSubset(context: RegistrationContext, requestedGrants?: RequestedGrant[]): boolean {
        if (!requestedGrants || requestedGrants.length === 0) {
            return true;
        }

        return requestedGrants.every((requested) =>
            context.grants.some((configured) => {
                const configuredEntityId = configured.entityId || "*";
                const requestedEntityId = requested.entityId || "*";
                return configured.entityTypeId === requested.entityTypeId &&
                    configured.relation === requested.relation &&
                    (configuredEntityId === "*" || configuredEntityId === requestedEntityId);
            })
        );
    }

    private selectedGrants(context: RegistrationContext, requestedGrants?: RequestedGrant[]): RequestedGrant[] {
        return requestedGrants && requestedGrants.length > 0
            ? requestedGrants
            : context.grants.map((grant) => ({
                entityTypeId: grant.entityTypeId,
                relation: grant.relation,
                entityId: grant.entityId,
            }));
    }

    private async validateTargetAuthorizationSpaceOnboarding(
        context: RegistrationContext
    ): Promise<ContextValidationResult> {
        if (context.targetKind !== "authorization_space" || !context.targetId) {
            return { valid: false, error: "Onboarding Flow must target an authorization space" };
        }

        const space = await authorizationSpaceRepo.findById(context.targetId);
        if (!space || !space.enabled || !space.onboardingEnabled) {
            return { valid: false, error: "Authorization space onboarding is disabled" };
        }

        return { valid: true, context };
    }

    private async assertContextGrantTargets(
        context: RegistrationContext,
        requestedGrants?: RequestedGrant[]
    ): Promise<void> {
        const grantsToApply = this.selectedGrants(context, requestedGrants);

        if (grantsToApply.length === 0) {
            throw new Error("Onboarding Flow must configure at least one grant");
        }

        if (!this.grantsAreSubset(context, grantsToApply)) {
            throw new Error("Requested grants are outside the Onboarding Flow");
        }

        for (const grant of grantsToApply) {
            if (!grant.entityTypeId || !grant.relation) {
                throw new Error("Grant target and relation are required");
            }

            const model = await authzModelRepo.findById(grant.entityTypeId);

            if (!model) {
                throw new Error(`Authorization model not found for entityTypeId ${grant.entityTypeId}`);
            }

            if (!Object.prototype.hasOwnProperty.call(model.definition.relations ?? {}, grant.relation)) {
                throw new Error(`Relation '${grant.relation}' is not defined on model '${model.entityType}'`);
            }

            if (context.targetKind === "authorization_space") {
                if (!model.authorizationSpaceId || model.authorizationSpaceId !== context.targetId) {
                    throw new Error(`Model '${model.entityType}' is outside the target authorization space`);
                }
            }
        }
    }

    async validateContextGrantTargets(
        context: RegistrationContext,
        requestedGrants?: RequestedGrant[]
    ): Promise<ContextValidationResult> {
        try {
            await this.assertContextGrantTargets(context, requestedGrants);
            return { valid: true, context };
        } catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : "Grant targets are invalid",
            };
        }
    }

    private async validateInviteContextPolicy(
        context: RegistrationContext,
        signUpEmail?: string
    ): Promise<ContextValidationResult> {
        if (!context.enabled) {
            return { valid: false, error: "Registration context is disabled" };
        }

        const policy = await signupPolicyRepo.get();
        if (!policy.inviteEnabled) {
            return { valid: false, error: "Invite signup is disabled" };
        }

        if (context.signupMode !== "invite_only") {
            return { valid: false, error: "This Onboarding Flow does not allow invites" };
        }

        const spaceCheck = await this.validateTargetAuthorizationSpaceOnboarding(context);
        if (!spaceCheck.valid) {
            return spaceCheck;
        }

        if (signUpEmail && !this.isEmailDomainAllowed(signUpEmail, context.allowedDomains)) {
            return { valid: false, error: "Email domain is not allowed" };
        }

        return this.validateContextGrantTargets(context);
    }

    async createSignedSignupIntent(payload: Omit<SignupIntentPayload, "kind" | "nonce" | "exp"> & {
        expiresInSeconds?: number;
    }): Promise<{ token: string; nonce: string; expiresAt: Date }> {
        const expiresInSeconds = payload.expiresInSeconds ?? DEFAULT_SIGNUP_INTENT_TTL_SECONDS;
        if (
            !Number.isFinite(expiresInSeconds) ||
            expiresInSeconds < MIN_SIGNUP_INTENT_TTL_SECONDS ||
            expiresInSeconds > MAX_SIGNUP_INTENT_TTL_SECONDS
        ) {
            throw new Error(
                `Signup intent expiry must be between ${MIN_SIGNUP_INTENT_TTL_SECONDS} and ${MAX_SIGNUP_INTENT_TTL_SECONDS} seconds`
            );
        }

        const nonce = randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
        const intentPayload: SignupIntentPayload = {
            kind: SIGNUP_INTENT_KIND,
            flow: payload.flow,
            trigger: payload.trigger,
            authorizationSpaceId: payload.authorizationSpaceId,
            requestedGrants: payload.requestedGrants,
            returnUrl: payload.returnUrl,
            nonce,
            exp: expiresAt.getTime(),
        };
        const policyCheck = await this.validateSignupIntentPolicy(intentPayload);
        if (!policyCheck.valid) {
            throw new Error(policyCheck.error ?? "Signup intent is not allowed");
        }
        const random = randomBytes(16).toString("hex");
        const sig = this.signPayload(intentPayload, random);
        const token = Buffer.from(
            JSON.stringify({ payload: intentPayload, random, sig })
        ).toString("base64url");

        await signupIntentNonceRepo.create({
            nonce,
            flowSlug: payload.flow,
            triggerKind: payload.trigger.kind,
            triggerId: payload.trigger.id,
            returnUrl: payload.returnUrl,
            expiresAt,
        });

        return { token, nonce, expiresAt };
    }

    async validateSignupIntent(
        token: string,
        signUpEmail?: string
    ): Promise<SignupIntentValidationResult> {
        try {
            const decoded = JSON.parse(
                Buffer.from(token, "base64url").toString("utf-8")
            ) as { payload: SignupIntentPayload; random: string; sig: string };

            if (decoded.payload.kind !== SIGNUP_INTENT_KIND) {
                return { valid: false, error: "Invalid signup intent kind" };
            }

            const expectedSig = this.signPayload(decoded.payload, decoded.random);
            if (!this.signaturesEqual(decoded.sig, expectedSig)) {
                return { valid: false, error: "Invalid signup intent signature" };
            }

            if (Date.now() > decoded.payload.exp) {
                return { valid: false, error: "Signup link has expired" };
            }

            const nonce = await signupIntentNonceRepo.findByNonce(decoded.payload.nonce);
            if (!nonce || nonce.consumedAt || new Date(nonce.expiresAt).getTime() <= Date.now()) {
                return { valid: false, error: "Signup link is no longer active" };
            }

            return this.validateSignupIntentPolicy(decoded.payload, signUpEmail);
        } catch (error) {
            console.error("Signup intent validation error:", error);
            return { valid: false, error: "Invalid signup intent format" };
        }
    }

    async validateSignupIntentPolicy(
        payload: SignupIntentPayload,
        signUpEmail?: string
    ): Promise<SignupIntentValidationResult> {
        const policy = await signupPolicyRepo.get();
        if (!policy.publicSignedIntentEnabled) {
            return { valid: false, error: "Public signup is disabled" };
        }

        const context = await registrationContextRepo.findBySlug(payload.flow);
        if (!context || !context.enabled) {
            return { valid: false, error: "Onboarding Flow is not active" };
        }

        if (context.signupMode !== "public_signed_intent") {
            return { valid: false, error: "Onboarding Flow does not allow public signup" };
        }

        if (
            context.targetKind !== "authorization_space" ||
            context.targetId !== payload.authorizationSpaceId
        ) {
            return { valid: false, error: "Signup intent targets the wrong authorization space" };
        }

        const space = await authorizationSpaceRepo.findById(payload.authorizationSpaceId);
        if (!space || !space.enabled || !space.onboardingEnabled) {
            return { valid: false, error: "Authorization space onboarding is disabled" };
        }

        if (!this.isTriggerAllowed(payload.trigger, space.onboardingAllowedTriggers)) {
            return { valid: false, error: "Trigger principal is not allowed by the authorization space" };
        }

        if (!this.isTriggerAllowed(payload.trigger, context.allowedTriggerPrincipals)) {
            return { valid: false, error: "Trigger principal is not allowed by the Onboarding Flow" };
        }

        if (!this.grantsAreSubset(context, payload.requestedGrants)) {
            return { valid: false, error: "Requested grants are outside the Onboarding Flow" };
        }

        if (!this.isReturnUrlAllowed(payload.returnUrl, context.allowedReturnUrls)) {
            return { valid: false, error: "Return URL is not allowed" };
        }

        if (signUpEmail && !this.isEmailDomainAllowed(signUpEmail, context.allowedDomains)) {
            return { valid: false, error: "Email domain is not allowed" };
        }

        const grantTargetCheck = await this.validateContextGrantTargets(context, payload.requestedGrants);
        if (!grantTargetCheck.valid) {
            return grantTargetCheck;
        }

        return { valid: true, context, payload };
    }

    async consumeSignupIntentNonce(nonce: string, email: string): Promise<boolean> {
        return signupIntentNonceRepo.consume(nonce, email);
    }

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

        const invitePolicy = await this.validateInviteContextPolicy(context, options.email);
        if (!invitePolicy.valid) {
            throw new Error(invitePolicy.error ?? "Invite signup is disabled");
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
        const signature = this.signPayload(payload, randomPart);

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
            const expectedSig = this.signPayload(payload, random);

            if (!this.signaturesEqual(sig, expectedSig)) {
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

            if (invite.contextSlug !== payload.contextSlug) {
                return { valid: false, error: "Invite context mismatch" };
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

            const invitePolicy = await this.validateInviteContextPolicy(context, signUpEmail);
            if (!invitePolicy.valid) {
                return { valid: false, error: invitePolicy.error };
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
        userId: string,
        requestedGrants?: RequestedGrant[]
    ): Promise<AppliedContextGrantStats> {
        let appliedCount = 0;
        let projectedCount = 0;
        const grantsToApply = this.selectedGrants(context, requestedGrants);
        await this.assertContextGrantTargets(context, requestedGrants);

        for (const grant of grantsToApply) {
            // Look up authorization model by ID to get current entity type name
            const model = await authzModelRepo.findById(grant.entityTypeId);
            if (!model) continue;

            // Create tuple using the current (possibly renamed) entity type
            const result = await tupleRepo.createIfNotExists({
                entityType: model.entityType, // e.g., "client_abc:invoice" (current name)
                entityTypeId: model.id, // Stable ID reference
                authorizationSpaceId: model.authorizationSpaceId,
                entityId: grant.entityId || "*", // Wildcard for all entities of this type
                relation: grant.relation,
                subjectType: "user",
                subjectId: userId,
            });

            if (result.created) {
                appliedCount += 1;
                const ownerClientId = getAuthorizationModelOwnerClientId(model.entityType);
                if (context.clientId && ownerClientId && ownerClientId !== context.clientId) {
                    projectedCount += 1;
                }
            }
        }

        return {
            appliedCount,
            projectedCount,
        };
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

    async validatePendingGrantApplication(
        pending: PendingGrantValidationInput,
        email: string
    ): Promise<ContextValidationResult> {
        const context = await registrationContextRepo.findBySlug(pending.contextSlug);

        if (!context) {
            return { valid: false, error: `Registration context not found: ${pending.contextSlug}` };
        }

        if (!context.enabled) {
            return { valid: false, error: "Onboarding Flow is not active" };
        }

        if (pending.tokenExpiresAt && pending.tokenExpiresAt.getTime() <= Date.now()) {
            return { valid: false, error: "Signup intent expired before email verification completed" };
        }

        if (pending.inviteId || pending.triggerKind === "invite") {
            if (!pending.inviteId) {
                return { valid: false, error: "Invite is required for invite onboarding grants" };
            }

            const invite = await platformInviteRepo.findById(pending.inviteId);
            if (!invite) {
                return { valid: false, error: "Invite not found" };
            }
            if (invite.contextSlug !== pending.contextSlug) {
                return { valid: false, error: "Invite context mismatch" };
            }
            if (invite.consumedAt) {
                return { valid: false, error: "Invite has already been used" };
            }
            if (new Date(invite.expiresAt).getTime() <= Date.now()) {
                return { valid: false, error: "Invite has expired" };
            }
            if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
                return { valid: false, error: "This invite is for a different email address" };
            }

            return this.validateInviteContextPolicy(context, email);
        }

        if (pending.triggerKind === "oauth_client" || pending.triggerKind === "resource_server") {
            const triggerId = pending.triggerId ?? pending.triggerClientId ?? null;
            if (!triggerId) {
                return { valid: false, error: "Signup trigger is missing" };
            }
            if (!pending.returnUrl) {
                return { valid: false, error: "Signup continuation URL is missing" };
            }
            if (context.targetKind !== "authorization_space" || !context.targetId) {
                return { valid: false, error: "Onboarding Flow must target an authorization space" };
            }

            return this.validateSignupIntentPolicy({
                kind: SIGNUP_INTENT_KIND,
                flow: pending.contextSlug,
                trigger: {
                    kind: pending.triggerKind,
                    id: triggerId,
                },
                authorizationSpaceId: context.targetId,
                requestedGrants: pending.requestedGrants,
                returnUrl: pending.returnUrl,
                nonce: pending.nonce ?? "",
                exp: pending.tokenExpiresAt?.getTime() ?? Date.now(),
            }, email);
        }

        const spaceCheck = await this.validateTargetAuthorizationSpaceOnboarding(context);
        if (!spaceCheck.valid) {
            return spaceCheck;
        }

        return this.validateContextGrantTargets(context, pending.requestedGrants);
    }

    /**
     * Get all contexts for a client.
     */
    async getClientContexts(clientId: string): Promise<RegistrationContext[]> {
        return registrationContextRepo.findByClientId(clientId);
    }

    /**
     * Get all Onboarding Flows.
     */
    async getPlatformContexts(): Promise<RegistrationContext[]> {
        return registrationContextRepo.findOnboardingFlows();
    }
}

// Export singleton instance
export const registrationContextService = new RegistrationContextService();
