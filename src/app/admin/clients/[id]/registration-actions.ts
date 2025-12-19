"use server";

import { guards } from "@/lib/auth/platform-guard";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
    registrationContextRepo,
    permissionRequestRepo,
    type RegistrationContext,
    type PermissionRequest,
} from "@/lib/repositories/platform-access-repository";
import { oauthClientMetadataRepository } from "@/lib/repositories";
import { TupleRepository } from "@/lib/repositories/tuple-repository";

// Re-export types
export type { RegistrationContext, PermissionRequest };

export interface ClientRegistrationStatus {
    allowsContexts: boolean;
    contextCount: number;
}

// ============================================================================
// Client Registration Contexts
// ============================================================================

export async function getClientContexts(clientId: string): Promise<RegistrationContext[]> {
    await guards.clients.view();
    return registrationContextRepo.findByClientId(clientId);
}

export async function getClientRegistrationStatus(clientId: string): Promise<ClientRegistrationStatus> {
    await guards.clients.view();

    const metadata = await oauthClientMetadataRepository.findByClientId(clientId);
    const contexts = await registrationContextRepo.findByClientId(clientId);

    return {
        allowsContexts: metadata?.allowsRegistrationContexts ?? false,
        contextCount: contexts.length,
    };
}

export async function createClientContext(
    clientId: string,
    data: {
        slug: string;
        name: string;
        description?: string;
        allowedOrigins?: string[];
        grants: Array<{ relation: string }>;
    }
): Promise<{ success: boolean; context?: RegistrationContext; error?: string }> {
    try {
        await guards.clients.update();

        // Check if client is whitelisted
        const metadata = await oauthClientMetadataRepository.findByClientId(clientId);
        if (!metadata?.allowsRegistrationContexts) {
            return { success: false, error: "This client is not allowed to create registration contexts" };
        }

        // Check if slug already exists
        const existing = await registrationContextRepo.findBySlug(data.slug);
        if (existing) {
            return { success: false, error: "Context with this slug already exists" };
        }

        // Create context - grants are client-scoped (no entityType = this client)
        const context = await registrationContextRepo.create({
            slug: data.slug,
            name: data.name,
            description: data.description,
            clientId, // Client-owned context
            allowedOrigins: data.allowedOrigins || null,
            allowedDomains: null,
            grants: data.grants.map(g => ({ entityType: undefined, relation: g.relation })),
            enabled: true,
        });

        revalidatePath(`/admin/clients/${clientId}`);
        return { success: true, context };
    } catch (error) {
        console.error("createClientContext error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create context",
        };
    }
}

export async function toggleClientContext(
    clientId: string,
    contextSlug: string,
    enabled: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.clients.update();

        await registrationContextRepo.update(contextSlug, { enabled });

        revalidatePath(`/admin/clients/${clientId}`);
        return { success: true };
    } catch (error) {
        console.error("toggleClientContext error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update context",
        };
    }
}

export async function deleteClientContext(
    clientId: string,
    contextSlug: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.clients.update();

        await registrationContextRepo.delete(contextSlug);

        revalidatePath(`/admin/clients/${clientId}`);
        return { success: true };
    } catch (error) {
        console.error("deleteClientContext error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete context",
        };
    }
}

// ============================================================================
// Client Permission Requests
// ============================================================================

export async function getClientRequests(clientId: string): Promise<PermissionRequest[]> {
    await guards.clients.view();
    return permissionRequestRepo.findPendingByClient(clientId);
}

export async function approveClientRequest(
    clientId: string,
    requestId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.clients.update();
        const session = await getSession();

        if (!session?.user?.id) {
            return { success: false, error: "Not authenticated" };
        }

        // Get the request
        const request = await permissionRequestRepo.findById(requestId);
        if (!request) {
            return { success: false, error: "Request not found" };
        }

        // Verify request belongs to this client
        if (request.clientId !== clientId) {
            return { success: false, error: "Request does not belong to this client" };
        }

        if (request.status !== "pending") {
            return { success: false, error: "Request is not pending" };
        }

        // Create the tuple grant (client-scoped)
        const tupleRepo = new TupleRepository();
        await tupleRepo.create({
            entityType: `client_${clientId}`,
            entityId: "*",
            relation: request.relation,
            subjectType: "user",
            subjectId: request.userId,
        });

        // Update request status
        await permissionRequestRepo.resolve(requestId, "approved", session.user.id);

        revalidatePath(`/admin/clients/${clientId}`);
        return { success: true };
    } catch (error) {
        console.error("approveClientRequest error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to approve request",
        };
    }
}

export async function rejectClientRequest(
    clientId: string,
    requestId: string,
    reason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.clients.update();
        const session = await getSession();

        if (!session?.user?.id) {
            return { success: false, error: "Not authenticated" };
        }

        // Get the request
        const request = await permissionRequestRepo.findById(requestId);
        if (!request) {
            return { success: false, error: "Request not found" };
        }

        // Verify request belongs to this client
        if (request.clientId !== clientId) {
            return { success: false, error: "Request does not belong to this client" };
        }

        if (request.status !== "pending") {
            return { success: false, error: "Request is not pending" };
        }

        // Update request status
        await permissionRequestRepo.resolve(requestId, "rejected", session.user.id, reason);

        revalidatePath(`/admin/clients/${clientId}`);
        return { success: true };
    } catch (error) {
        console.error("rejectClientRequest error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to reject request",
        };
    }
}
