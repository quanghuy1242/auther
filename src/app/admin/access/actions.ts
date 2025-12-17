"use server";

import { guards } from "@/lib/auth/platform-guard";
import { revalidatePath } from "next/cache";
import {
    policyTemplateRepo,
    registrationContextRepo,
} from "@/lib/repositories/platform-access-repository";
import { oauthClientMetadataRepository, oauthClientRepository } from "@/lib/repositories";
import { authorizationModelRepository } from "@/lib/repositories";
import type { PolicyTemplate, RegistrationContext } from "@/lib/repositories/platform-access-repository";

// Re-export types
export type { PolicyTemplate, RegistrationContext };

export interface AuthorizationModel {
    id: string;
    entityType: string;
    relations: string[];
    description: string | null;
    clientId: string | null;
    isSystem: boolean;
    createdAt: Date;
}

export interface ClientWithRegistrationStatus {
    clientId: string;
    name: string | null;
    allowsRegistrationContexts: boolean;
    contextCount: number;
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

// ============================================================================
// Authorization Models (Platform Features)
// ============================================================================

export async function getAuthorizationModels(): Promise<AuthorizationModel[]> {
    await guards.platform.admin();

    const models = await authorizationModelRepository.findAll();

    // Convert to our format - extract relations from definition
    return models.map(m => ({
        id: m.id,
        entityType: m.entityType,
        relations: m.definition?.relations ? Object.keys(m.definition.relations) : [],
        description: null,
        clientId: null, // Platform models
        isSystem: false,
        createdAt: m.createdAt,
    }));
}

export async function createAuthorizationModel(data: {
    entityType: string;
    relations: string[];
    description?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        // Validate entity type
        if (!data.entityType.trim()) {
            return { success: false, error: "Entity type is required" };
        }

        // Check if entity type already exists
        const existing = await authorizationModelRepository.findByEntityType(data.entityType);
        if (existing) {
            return { success: false, error: "Entity type already exists" };
        }

        // Build definition with relations
        const relations: Record<string, Record<string, unknown>> = {};
        for (const rel of data.relations) {
            if (rel.trim()) {
                relations[rel.trim()] = {}; // Empty definition - can be extended
            }
        }

        if (Object.keys(relations).length === 0) {
            return { success: false, error: "At least one relation is required" };
        }

        await authorizationModelRepository.upsert(data.entityType.trim(), { relations, permissions: {} });

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
// Platform Registration Contexts
// ============================================================================

export async function getPlatformContexts(): Promise<RegistrationContext[]> {
    await guards.platform.admin();
    return registrationContextRepo.findPlatformContexts();
}

export async function createPlatformContext(data: {
    slug: string;
    name: string;
    description?: string;
    allowedOrigins?: string[];
    grants: Array<{ entityType?: string; relation: string }>;
}): Promise<{ success: boolean; context?: RegistrationContext; error?: string }> {
    try {
        await guards.platform.admin();

        // Check if slug already exists
        const existing = await registrationContextRepo.findBySlug(data.slug);
        if (existing) {
            return { success: false, error: "Context with this slug already exists" };
        }

        const context = await registrationContextRepo.create({
            slug: data.slug,
            name: data.name,
            description: data.description,
            clientId: null, // Platform context
            allowedOrigins: data.allowedOrigins || null,
            allowedDomains: null,
            grants: data.grants,
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
