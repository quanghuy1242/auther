import { z } from "zod";

// =============================================================================
// PIPELINE HOOK SCHEMAS
// =============================================================================
// Following project conventions, all Zod schemas are centralized in src/schemas/

// =============================================================================
// HOOK EXECUTION MODES
// =============================================================================
export type HookExecutionMode = "blocking" | "async" | "enrichment";

// =============================================================================
// SHARED SCHEMAS (Reusable Zod fragments)
// =============================================================================
export const RequestInfoSchema = z.object({
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    origin: z.string().optional(),
});

export const PipelineUserSchema = z.object({
    id: z.string(),
    email: z.string().optional(),
    name: z.string().optional(),
    role: z.string().optional(),
});

export const PipelineSessionSchema = z.object({
    id: z.string(),
    userId: z.string(),
    expiresAt: z.coerce.date().optional(),
});

export const PipelineApiKeySchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    userId: z.string(),
    permissions: z.array(z.string()).optional(),
});

export const OAuthClientSchema = z.object({
    clientId: z.string(),
    name: z.string().optional(),
    type: z.enum(["public", "confidential"]).optional(),
    redirectUri: z.string().optional(),
});

// =============================================================================
// STANDARD OUTPUT SCHEMAS
// =============================================================================
export const BlockingOutputSchema = z.object({
    allowed: z.boolean(),
    error: z.string().optional(),
});

export const AsyncOutputSchema = z.object({
    allowed: z.literal(true), // Async hooks always "allow", they just log/notify
});

export const EnrichmentOutputSchema = z.object({
    allowed: z.boolean(),
    data: z.record(z.string(), z.any()).optional(), // data merges into target (e.g., JWT claims)
});

// =============================================================================
// HOOK INPUT SCHEMAS (Per Hook)
// =============================================================================

// Authentication Lifecycle
export const BeforeSignupInputSchema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    request: RequestInfoSchema,
});

export const AfterSignupInputSchema = z.object({
    user: PipelineUserSchema,
    request: RequestInfoSchema,
});

export const BeforeSigninInputSchema = z.object({
    email: z.string().email(),
    request: RequestInfoSchema,
});

export const AfterSigninInputSchema = z.object({
    user: PipelineUserSchema,
    session: PipelineSessionSchema,
});

export const BeforeSignoutInputSchema = z.object({
    user: PipelineUserSchema,
    session: PipelineSessionSchema,
});

export const TokenBuildInputSchema = z.object({
    user: PipelineUserSchema,
    token: z.record(z.string(), z.any()), // existing token claims
});

// API Key Lifecycle
export const ApiKeyBeforeCreateInputSchema = z.object({
    userId: z.string(),
    name: z.string().optional(),
    permissions: z.array(z.string()).optional(),
});

export const ApiKeyAfterCreateInputSchema = z.object({
    apikey: PipelineApiKeySchema,
    userId: z.string(),
});

export const ApiKeyBeforeExchangeInputSchema = z.object({
    apikey: PipelineApiKeySchema,
    request: RequestInfoSchema,
});

export const ApiKeyAfterExchangeInputSchema = z.object({
    apikey: PipelineApiKeySchema,
});

export const ApiKeyBeforeRevokeInputSchema = z.object({
    apikey: PipelineApiKeySchema,
});

// OAuth Client Lifecycle
export const ClientBeforeRegisterInputSchema = z.object({
    name: z.string(),
    redirectUrls: z.array(z.string()),
    type: z.enum(["public", "confidential"]).optional(),
});

export const ClientAfterRegisterInputSchema = z.object({
    client: OAuthClientSchema,
});

export const ClientBeforeAuthorizeInputSchema = z.object({
    user: PipelineUserSchema,
    client: OAuthClientSchema,
    scopes: z.array(z.string()),
});

export const ClientAfterAuthorizeInputSchema = z.object({
    user: PipelineUserSchema,
    client: OAuthClientSchema,
    grant: z.object({
        scopes: z.array(z.string())
    }),
});

export const ClientAccessChangeInputSchema = z.object({
    user: PipelineUserSchema,
    client: OAuthClientSchema,
    action: z.enum(["grant", "revoke"]),
});
