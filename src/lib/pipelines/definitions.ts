// =============================================================================
// PIPELINE HOOK REGISTRY
// =============================================================================
// This file defines all 16 pipeline hooks that can be wired to trigger events.
// Schemas are imported from src/schemas/pipelines.ts (per project conventions).

import {
    // Shared schemas
    type HookExecutionMode,
    // Output schemas
    BlockingOutputSchema,
    AsyncOutputSchema,
    EnrichmentOutputSchema,
    // Input schemas
    BeforeSignupInputSchema,
    AfterSignupInputSchema,
    BeforeSigninInputSchema,
    AfterSigninInputSchema,
    BeforeSignoutInputSchema,
    TokenBuildInputSchema,
    ApiKeyBeforeCreateInputSchema,
    ApiKeyAfterCreateInputSchema,
    ApiKeyBeforeExchangeInputSchema,
    ApiKeyAfterExchangeInputSchema,
    ApiKeyBeforeRevokeInputSchema,
    ClientBeforeRegisterInputSchema,
    ClientAfterRegisterInputSchema,
    ClientBeforeAuthorizeInputSchema,
    ClientAfterAuthorizeInputSchema,
    ClientAccessChangeInputSchema,
} from "@/schemas/pipelines";
import { z } from "zod";

// =============================================================================
// HOOK DEFINITION INTERFACE
// =============================================================================
export interface PipelineHookDefinition<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
    type: HookExecutionMode;
    description: string;
    input: TInput;
    output: TOutput;
}

// =============================================================================
// THE HOOK REGISTRY (All 16 Hooks)
// =============================================================================
export const HOOK_REGISTRY = {
    // -------------------------------------------------------------------------
    // GROUP 1: AUTHENTICATION LIFECYCLE (6 Hooks)
    // -------------------------------------------------------------------------
    "before_signup": {
        type: "blocking" as const,
        description: "Runs before user creation. Return allowed:false to abort signup.",
        input: BeforeSignupInputSchema,
        output: BlockingOutputSchema,
    },
    "after_signup": {
        type: "async" as const,
        description: "Runs after successful signup. For welcome emails, CRM sync.",
        input: AfterSignupInputSchema,
        output: AsyncOutputSchema,
    },
    "before_signin": {
        type: "blocking" as const,
        description: "Runs before authentication. Check bans, lockouts, maintenance.",
        input: BeforeSigninInputSchema,
        output: BlockingOutputSchema,
    },
    "after_signin": {
        type: "async" as const,
        description: "Runs after successful login. Audit trail, update last_seen.",
        input: AfterSigninInputSchema,
        output: AsyncOutputSchema,
    },
    "before_signout": {
        type: "blocking" as const,
        description: "Runs before session termination. Rarely used.",
        input: BeforeSignoutInputSchema,
        output: BlockingOutputSchema,
    },
    "token_build": {
        type: "enrichment" as const,
        description: "Runs during JWT/token generation. Return data to inject custom claims.",
        input: TokenBuildInputSchema,
        output: EnrichmentOutputSchema,
    },

    // -------------------------------------------------------------------------
    // GROUP 2: API KEY LIFECYCLE (5 Hooks)
    // -------------------------------------------------------------------------
    "apikey_before_create": {
        type: "blocking" as const,
        description: "Runs before API key creation. Enforce max keys, naming rules.",
        input: ApiKeyBeforeCreateInputSchema,
        output: BlockingOutputSchema,
    },
    "apikey_after_create": {
        type: "async" as const,
        description: "Runs after API key creation. Notify security team.",
        input: ApiKeyAfterCreateInputSchema,
        output: AsyncOutputSchema,
    },
    "apikey_before_exchange": {
        type: "blocking" as const,
        description: "Runs when API key is used. Extra validation, origin checks.",
        input: ApiKeyBeforeExchangeInputSchema,
        output: BlockingOutputSchema,
    },
    "apikey_after_exchange": {
        type: "async" as const,
        description: "Runs after successful API key exchange. Usage logging.",
        input: ApiKeyAfterExchangeInputSchema,
        output: AsyncOutputSchema,
    },
    "apikey_before_revoke": {
        type: "blocking" as const,
        description: "Runs before API key revocation. Prevent accidental deletion.",
        input: ApiKeyBeforeRevokeInputSchema,
        output: BlockingOutputSchema,
    },

    // -------------------------------------------------------------------------
    // GROUP 3: OAUTH CLIENT LIFECYCLE (5 Hooks)
    // -------------------------------------------------------------------------
    "client_before_register": {
        type: "blocking" as const,
        description: "Runs before OAuth client registration. Validate metadata.",
        input: ClientBeforeRegisterInputSchema,
        output: BlockingOutputSchema,
    },
    "client_after_register": {
        type: "async" as const,
        description: "Runs after OAuth client creation. Internal notification.",
        input: ClientAfterRegisterInputSchema,
        output: AsyncOutputSchema,
    },
    "client_before_authorize": {
        type: "blocking" as const,
        description: "Runs during OAuth authorization. Validate scopes, user access.",
        input: ClientBeforeAuthorizeInputSchema,
        output: BlockingOutputSchema,
    },
    "client_after_authorize": {
        type: "async" as const,
        description: "Runs after OAuth consent. Audit consent grants.",
        input: ClientAfterAuthorizeInputSchema,
        output: AsyncOutputSchema,
    },
    "client_access_change": {
        type: "async" as const,
        description: "Runs when client access is granted/revoked for a user.",
        input: ClientAccessChangeInputSchema,
        output: AsyncOutputSchema,
    },
} as const;

// =============================================================================
// TYPE EXPORTS (For use by Integrator)
// =============================================================================
export type HookName = keyof typeof HOOK_REGISTRY;

export type HookInput<T extends HookName> = z.infer<typeof HOOK_REGISTRY[T]["input"]>;
export type HookOutput<T extends HookName> = z.infer<typeof HOOK_REGISTRY[T]["output"]>;

// Re-export HookExecutionMode for convenience
export type { HookExecutionMode } from "@/schemas/pipelines";
