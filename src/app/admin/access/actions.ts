"use server";

import { guards } from "@/lib/auth/platform-guard";
import { revalidatePath } from "next/cache";
import {
    oauthClientMetadataRepository,
    oauthClientRepository,
    authorizationModelRepository,
    authorizationSpaceRepository
} from "@/lib/repositories";
import { TupleRepository } from "@/lib/repositories/tuple-repository";
import {
    policyTemplateRepo,
    registrationContextRepo,
    signupPolicyRepo
} from "@/lib/repositories/platform-access-repository";
import type { PolicyTemplate, RegistrationContext, SignupPolicy } from "@/lib/repositories/platform-access-repository";
import { AuthorizationModelService } from "@/lib/auth/authorization-model-service";
import { SYSTEM_MODELS } from "@/lib/auth/system-models";
import { AuthorizationModelDefinition } from "@/schemas/rebac";
import { metricsService } from "@/lib/services";
import { resolveRegistrationContextGrantTargets } from "@/lib/utils/registration-context-grants";

const authorizationModelService = new AuthorizationModelService();

// Re-export types
export type { PolicyTemplate, RegistrationContext, SignupPolicy };

export interface AuthorizationModel {
    id: string;
    entityType: string;
    relations: string[];
    definition?: AuthorizationModelDefinition;
    permissions?: string[];
    description: string | null;
    clientId: string | null;
    authorizationSpaceId: string | null;
    isSystem: boolean;
    isOverridden?: boolean;
    createdAt: Date;
}

export interface ClientWithRegistrationStatus {
    clientId: string;
    name: string | null;
    allowsRegistrationContexts: boolean;
    contextCount: number;
}

export interface AuthorizationSpaceOption {
    id: string;
    slug: string;
    name: string;
    onboardingEnabled: boolean;
    onboardingAllowedTriggers: Array<{ kind: "oauth_client" | "resource_server"; id: string }>;
}

// ============================================================================
// Signup Policy
// ============================================================================

export async function getSignupPolicy(): Promise<SignupPolicy> {
    await guards.platform.admin();
    return signupPolicyRepo.get();
}

export async function updateSignupPolicy(data: {
    directSignupEnabled: boolean;
    publicSignedIntentEnabled: boolean;
    inviteEnabled: boolean;
}): Promise<{ success: boolean; policy?: SignupPolicy; error?: string }> {
    try {
        await guards.platform.admin();
        const policy = await signupPolicyRepo.update(data);
        revalidatePath("/admin/access");
        return { success: true, policy };
    } catch (error) {
        console.error("updateSignupPolicy error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update signup policy",
        };
    }
}

export async function getAuthorizationSpaceOptions(): Promise<AuthorizationSpaceOption[]> {
    await guards.platform.admin();
    const spaces = await authorizationSpaceRepository.findAll();
    return spaces
        .filter((space) => space.enabled)
        .map((space) => ({
            id: space.id,
            slug: space.slug,
            name: space.name,
            onboardingEnabled: space.onboardingEnabled,
            onboardingAllowedTriggers: space.onboardingAllowedTriggers,
        }));
}

// ============================================================================
// Policy Templates
// ============================================================================

export async function getPolicyTemplates(): Promise<PolicyTemplate[]> {
    await guards.platform.admin();
    return policyTemplateRepo.findAll();
}

export async function createPolicyTemplate(data: {
    name: string;
    description?: string;
    permissions: Array<{ entityType: string; entityId?: string; relation: string }>;
}): Promise<{ success: boolean; template?: PolicyTemplate; error?: string }> {
    try {
        await guards.platform.admin();

        const template = await policyTemplateRepo.create({
            name: data.name,
            description: data.description,
            category: "custom",
            isSystem: false,
            permissions: data.permissions,
        });

        revalidatePath("/admin/access");
        return { success: true, template };
    } catch (error) {
        console.error("createPolicyTemplate error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create template",
        };
    }
}

export async function deletePolicyTemplate(
    id: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        // Check if system template
        const template = await policyTemplateRepo.findById(id);
        if (template?.isSystem) {
            return { success: false, error: "Cannot delete system templates" };
        }

        const deleted = await policyTemplateRepo.delete(id);
        if (!deleted) {
            return { success: false, error: "Template not found" };
        }

        revalidatePath("/admin/access");
        return { success: true };
    } catch (error) {
        console.error("deletePolicyTemplate error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete template",
        };
    }
}

export async function applyTemplateToUsers(data: {
    templateId: string;
    userIds: string[];
}): Promise<{ success: boolean; error?: string; appliedCount?: number }> {
    try {
        await guards.platform.admin();

        // Get the template
        const template = await policyTemplateRepo.findById(data.templateId);
        if (!template) {
            return { success: false, error: "Template not found" };
        }

        if (data.userIds.length === 0) {
            return { success: false, error: "No users selected" };
        }

        // Apply all permissions from the template to each user
        let appliedCount = 0;
        const tupleRepo = new TupleRepository();

        for (const userId of data.userIds) {
            for (const perm of template.permissions) {
                const result = await tupleRepo.createIfNotExists({
                    entityType: perm.entityType,
                    entityId: perm.entityId || "*",
                    relation: perm.relation,
                    subjectType: "user",
                    subjectId: userId,
                });
                if (result.created) {
                    appliedCount++;
                }
            }
        }

        revalidatePath("/admin/access");
        revalidatePath("/admin/users");
        return { success: true, appliedCount };
    } catch (error) {
        console.error("applyTemplateToUsers error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to apply template",
        };
    }
}

// ============================================================================
// Authorization Models (Platform Features)
// ============================================================================

export async function getAuthorizationModels(): Promise<AuthorizationModel[]> {
    await guards.platform.admin();

    const models = await authorizationModelRepository.findAll();
    const systemEntityTypes = new Set(SYSTEM_MODELS.map(m => m.entityType));

    // 1. Process Database Models
    const processedDbModels = models.map(m => {
        const isSystemOverride = systemEntityTypes.has(m.entityType);
        const def = m.definition as AuthorizationModelDefinition;
        return {
            id: m.id,
            entityType: m.entityType,
            relations: Object.keys(def.relations || {}),
            definition: def,
            description: isSystemOverride ? SYSTEM_MODELS.find(s => s.entityType === m.entityType)?.description || null : null,
            clientId: null,
            authorizationSpaceId: m.authorizationSpaceId,
            isSystem: isSystemOverride, // It IS a system feature, but properly overridden
            isOverridden: isSystemOverride,
            createdAt: m.createdAt,
        };
    });

    // 2. Identify System Models NOT in Database
    const dbEntityTypes = new Set(processedDbModels.map(m => m.entityType));
    const pureSystemModels = SYSTEM_MODELS
        .filter(m => !dbEntityTypes.has(m.entityType))
        .map(m => ({
            id: `system-${m.entityType}`,
            entityType: m.entityType,
            relations: m.relations ? Object.keys(m.relations) : [],
            definition: {
                relations: m.relations,
                permissions: m.permissions
            } as AuthorizationModelDefinition,
            description: m.description,
            clientId: null,
            authorizationSpaceId: null,
            isSystem: true,
            isOverridden: false,
            createdAt: new Date(),
        }));

    return [...pureSystemModels, ...processedDbModels];
}

export async function createAuthorizationModel(data: {
    entityType: string;
    relations: Array<{ name: string; inheritsFrom: string[] }>;
    permissions?: Record<string, { relation: string }>;
    description?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        // Validate entity type
        if (!data.entityType.trim()) {
            return { success: false, error: "Entity type is required" };
        }

        // Check if entity type already exists in custom models
        const existing = await authorizationModelRepository.findByEntityType(data.entityType);
        if (existing) {
            return { success: false, error: "Entity type already exists" };
        }
        // If permissions are not provided, try to preserve them from System Defaults
        let permissions = data.permissions;
        if (!permissions) {
            const systemModel = SYSTEM_MODELS.find(m => m.entityType === data.entityType);
            if (systemModel) {
                permissions = systemModel.permissions;
            }
        }

        // Construct definition with hierarchy support
        const rels: Record<string, string[] | { union: string[] }> = {};
        for (const r of data.relations) {
            if (r.inheritsFrom && r.inheritsFrom.length > 0) {
                rels[r.name] = { union: r.inheritsFrom };
            } else {
                rels[r.name] = [];
            }
        }

        if (Object.keys(rels).length === 0) { // Changed from `relations` to `rels`
            return { success: false, error: "At least one relation is required" };
        }

        const def = {
            relations: rels,
            permissions: permissions || {}
        };

        await authorizationModelService.upsertModel(data.entityType.trim(), def);

        // Metric: policy change (auth model created)
        void metricsService.count("admin.policy.change.count", 1, { action: "create" });

        revalidatePath("/admin/access");
        return { success: true };
    } catch (error) {
        console.error("createAuthorizationModel error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create model",
        };
    }
}

export async function deleteAuthorizationModel(
    entityType: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        const result = await authorizationModelRepository.delete(entityType);

        if (!result.deleted) {
            return { success: false, error: result.error || "Failed to delete model" };
        }

        revalidatePath("/admin/access");
        return { success: true };
    } catch (error) {
        console.error("deleteAuthorizationModel error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete model",
        };
    }
}

export async function updateAuthorizationModel(data: {
    entityType: string;
    relations: Array<{ name: string; inheritsFrom: string[] }>;
    permissions?: Record<string, { relation: string }>;
    description?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        if (!data.entityType.trim()) {
            return { success: false, error: "Entity type is required" };
        }

        // For updates, we skip the existence check and directly upsert
        // Construct definition with hierarchy support
        const rels: Record<string, string[] | { union: string[] }> = {};
        for (const r of data.relations) {
            if (r.inheritsFrom && r.inheritsFrom.length > 0) {
                rels[r.name] = { union: r.inheritsFrom };
            } else {
                rels[r.name] = [];
            }
        }

        if (Object.keys(rels).length === 0) {
            return { success: false, error: "At least one relation is required" };
        }

        const def = {
            relations: rels,
            permissions: data.permissions || {}
        };

        await authorizationModelService.upsertModel(data.entityType.trim(), def);

        // Metric: policy change (auth model updated)
        void metricsService.count("admin.policy.change.count", 1, { action: "update" });

        revalidatePath("/admin/access");
        return { success: true };
    } catch (error) {
        console.error("updateAuthorizationModel error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update model",
        };
    }
}

// ============================================================================
// Client Registration Whitelist
// ============================================================================

export async function getClientsWithRegistrationStatus(): Promise<ClientWithRegistrationStatus[]> {
    await guards.platform.admin();

    // Get all clients
    const clientsResult = await oauthClientRepository.findMany(1, 100, {});

    // Get metadata for each client
    const result: ClientWithRegistrationStatus[] = [];

    for (const client of clientsResult.items) {
        const clientId = client.clientId ?? "";
        if (!clientId) continue;

        const metadata = await oauthClientMetadataRepository.findByClientId(clientId);
        let contextCount = 0;
        try {
            const contexts = await registrationContextRepo.findByClientId(clientId);
            contextCount = contexts.length;
        } catch {
            // Client may not have contexts
        }

        result.push({
            clientId: client.clientId ?? "",
            name: client.name,
            allowsRegistrationContexts: metadata?.allowsRegistrationContexts ?? false,
            contextCount,
        });
    }

    return result;
}

export async function toggleClientRegistrationContexts(
    clientId: string,
    allowed: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        // Find or create metadata
        const metadata = await oauthClientMetadataRepository.findByClientId(clientId);

        if (!metadata) {
            await oauthClientMetadataRepository.create({
                clientId,
                allowsRegistrationContexts: allowed,
            });
        } else {
            await oauthClientMetadataRepository.update(clientId, {
                allowsRegistrationContexts: allowed,
            });
        }

        revalidatePath("/admin/access");
        return { success: true };
    } catch (error) {
        console.error("toggleClientRegistrationContexts error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update client",
        };
    }
}

// ============================================================================
// Onboarding Flows
// ============================================================================

export async function getPlatformContexts(): Promise<RegistrationContext[]> {
    await guards.platform.admin();
    return registrationContextRepo.findOnboardingFlows();
}

export async function createPlatformContext(data: {
    slug: string;
    name: string;
    description?: string;
    allowedOrigins?: string[];
    allowedDomains?: string[];
    allowedReturnUrls?: string[];
    signupMode?: "disabled" | "public_signed_intent" | "invite_only";
    targetAuthorizationSpaceId?: string;
    allowedTriggerPrincipals?: Array<{ kind: "oauth_client" | "resource_server"; id: string }>;
    theme?: string | null;
    grants: Array<{ entityTypeId: string; relation: string; entityId?: string }>;
}): Promise<{ success: boolean; context?: RegistrationContext; error?: string }> {
    try {
        await guards.platform.admin();

        // Check if slug already exists
        const existing = await registrationContextRepo.findBySlug(data.slug);
        if (existing) {
            return { success: false, error: "Context with this slug already exists" };
        }

        if (!data.grants || data.grants.length === 0) {
            return { success: false, error: "At least one grant is required" };
        }

        if (data.signupMode === "public_signed_intent") {
            if (!data.targetAuthorizationSpaceId) {
                return { success: false, error: "Public signed-intent flows must target an authorization space" };
            }
            if (!data.allowedReturnUrls || data.allowedReturnUrls.length === 0) {
                return { success: false, error: "Public signed-intent flows require at least one allowed return URL" };
            }
            if (!data.allowedTriggerPrincipals || data.allowedTriggerPrincipals.length === 0) {
                return { success: false, error: "Public signed-intent flows require at least one allowed trigger principal" };
            }
        }

        if (data.targetAuthorizationSpaceId && data.allowedTriggerPrincipals?.length) {
            const targetSpace = await authorizationSpaceRepository.findById(data.targetAuthorizationSpaceId);
            if (!targetSpace || !targetSpace.enabled) {
                return { success: false, error: "Target authorization space is not enabled" };
            }
            const allowedBySpace = new Set(
                targetSpace.onboardingAllowedTriggers.map((trigger) => `${trigger.kind}:${trigger.id}`)
            );
            const outsideSpacePolicy = data.allowedTriggerPrincipals.find(
                (trigger) => !allowedBySpace.has(`${trigger.kind}:${trigger.id}`)
            );
            if (outsideSpacePolicy) {
                return {
                    success: false,
                    error: `Trigger ${outsideSpacePolicy.kind}:${outsideSpacePolicy.id} is not allowed by the target authorization space`,
                };
            }
        }

        if (!data.targetAuthorizationSpaceId) {
            return { success: false, error: "Onboarding Flows must target an authorization space" };
        }

        const allowedAuthorizationSpaceIds = [data.targetAuthorizationSpaceId];
        const validation = await resolveRegistrationContextGrantTargets({
            sourceClientId: null,
            allowedProjectionClientIds: [],
            allowedAuthorizationSpaceIds,
            enforceAllowedAuthorizationSpaces: true,
            grants: data.grants,
            resolveModelById: (entityTypeId) => authorizationModelRepository.findById(entityTypeId),
        });

        if (!validation.ok) {
            return { success: false, error: validation.error };
        }

        const context = await registrationContextRepo.create({
            slug: data.slug,
            name: data.name,
            description: data.description,
            clientId: null, // Platform context
            triggerKind: data.allowedTriggerPrincipals?.[0]?.kind ?? "platform",
            triggerClientId:
                data.allowedTriggerPrincipals?.[0]?.kind === "oauth_client"
                    ? data.allowedTriggerPrincipals[0].id
                    : null,
            targetKind: "authorization_space",
            targetId: data.targetAuthorizationSpaceId,
            allowedOrigins: data.allowedOrigins || null,
            allowedDomains: data.allowedDomains || null,
            signupMode: data.signupMode ?? "invite_only",
            allowedTriggerPrincipals: data.allowedTriggerPrincipals ?? [],
            allowedReturnUrls: data.allowedReturnUrls ?? data.allowedOrigins ?? [],
            theme: data.theme ?? null,
            grants: data.grants, // Now uses entityTypeId
            enabled: true,
        });

        revalidatePath("/admin/access");
        return { success: true, context };
    } catch (error) {
        console.error("createPlatformContext error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create context",
        };
    }
}

export async function toggleContextEnabled(
    id: string,
    enabled: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        await registrationContextRepo.update(id, { enabled });

        revalidatePath("/admin/access");
        return { success: true };
    } catch (error) {
        console.error("toggleContextEnabled error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update context",
        };
    }
}

export async function deleteContext(
    id: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        await registrationContextRepo.delete(id);

        revalidatePath("/admin/access");
        return { success: true };
    } catch (error) {
        console.error("deleteContext error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete context",
        };
    }
}
