"use server";

import { guards } from "@/lib/auth/platform-guard";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
    permissionRequestRepo,
    permissionRuleRepo,
    type PermissionRequest,
    type PermissionRule,
} from "@/lib/repositories/platform-access-repository";
import { TupleRepository } from "@/lib/repositories/tuple-repository";
import {
    authorizationModelRepository,
    authorizationSpaceRepository,
    userRepository,
} from "@/lib/repositories";
import { metricsService } from "@/lib/services";

// Re-export types
export type { PermissionRequest, PermissionRule };

export interface PermissionRequestWithDetails extends PermissionRequest {
    userName?: string;
    userEmail?: string;
    resolverName?: string;
}

export interface SpaceRequestTarget {
    spaceId: string;
    spaceName: string;
    modelId: string;
    modelName: string;
    relations: string[];
}

// Helper to enrich requests with user details
async function enrichRequestsWithUserDetails(
    requests: PermissionRequest[]
): Promise<PermissionRequestWithDetails[]> {
    if (requests.length === 0) return [];

    // Collect unique user IDs (requesters and resolvers)
    const userIds = new Set<string>();
    for (const req of requests) {
        userIds.add(req.userId);
        if (req.resolvedBy) {
            userIds.add(req.resolvedBy);
        }
    }

    // Fetch all users at once
    const users = await userRepository.findByIds(Array.from(userIds));
    const userMap = new Map(users.map(u => [u.id, u]));

    // Enrich requests
    return requests.map(r => {
        const requestUser = userMap.get(r.userId);
        const resolverUser = r.resolvedBy ? userMap.get(r.resolvedBy) : undefined;

        return {
            ...r,
            userName: requestUser?.name,
            userEmail: requestUser?.email,
            resolverName: resolverUser?.name,
        };
    });
}

// ============================================================================
// Permission Requests
// ============================================================================

export async function getPendingRequests(): Promise<PermissionRequestWithDetails[]> {
    await guards.platform.admin();

    // Find pending platform-level requests (clientId = null)
    const requests = await permissionRequestRepo.findPendingByClient(null);

    return enrichRequestsWithUserDetails(requests);
}

export async function getAllRequests(): Promise<PermissionRequestWithDetails[]> {
    await guards.platform.admin();

    // Return all platform requests (pending, approved, rejected)
    const requests = await permissionRequestRepo.findAllByClient(null);

    return enrichRequestsWithUserDetails(requests);
}

export async function getSpaceRequestTargets(): Promise<SpaceRequestTarget[]> {
    await guards.platform.admin();
    const spaces = await authorizationSpaceRepository.findAll();
    const models = await authorizationModelRepository.findAll();
    const spacesById = new Map(spaces.map((space) => [space.id, space]));

    return models
        .filter((model) => model.authorizationSpaceId)
        .flatMap((model) => {
            const space = model.authorizationSpaceId ? spacesById.get(model.authorizationSpaceId) : null;
            if (!space) return [];
            return [{
                spaceId: space.id,
                spaceName: space.name,
                modelId: model.id,
                modelName: model.entityType,
                relations: Object.keys(model.definition.relations ?? {}).sort(),
            }];
        })
        .sort((a, b) =>
            a.spaceName.localeCompare(b.spaceName) ||
            a.modelName.localeCompare(b.modelName)
        );
}

export async function createAuthorizationSpacePermissionRequest(data: {
    userId: string;
    spaceId: string;
    modelId: string;
    entityId: string;
    relation: string;
    reason?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();
        const [space, model, user] = await Promise.all([
            authorizationSpaceRepository.findById(data.spaceId),
            authorizationModelRepository.findById(data.modelId),
            userRepository.findById(data.userId),
        ]);

        if (!space) return { success: false, error: "Authorization space not found" };
        if (!user) return { success: false, error: "User not found" };
        if (!model || model.authorizationSpaceId !== space.id) {
            return { success: false, error: "Model does not belong to this authorization space" };
        }
        if (!Object.keys(model.definition.relations ?? {}).includes(data.relation)) {
            return { success: false, error: "Relation is not defined for this model" };
        }

        await permissionRequestRepo.createTargeted({
            userId: data.userId,
            requestKind: "authorization_space",
            targetKind: "authorization_space",
            targetId: space.id,
            targetEntityTypeId: model.id,
            targetEntityId: data.entityId || "*",
            relation: data.relation,
            reason: data.reason || null,
            status: "pending",
        });

        revalidatePath("/admin/requests");
        return { success: true };
    } catch (error) {
        console.error("createAuthorizationSpacePermissionRequest error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create request",
        };
    }
}

export async function approveRequest(
    requestId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();
        const session = await getSession();

        if (!session?.user?.id) {
            return { success: false, error: "Not authenticated" };
        }

        // Get the request
        const request = await permissionRequestRepo.findById(requestId);
        if (!request) {
            return { success: false, error: "Request not found" };
        }

        if (request.status !== "pending") {
            return { success: false, error: "Request is not pending" };
        }

        // Create the tuple grant
        const tupleRepo = new TupleRepository();

        if (request.targetKind === "authorization_space" && request.targetEntityTypeId) {
            const model = await authorizationModelRepository.findById(request.targetEntityTypeId);
            if (!model || model.authorizationSpaceId !== request.targetId) {
                return { success: false, error: "Request target model does not belong to the authorization space" };
            }

            await tupleRepo.create({
                entityType: model.entityType,
                entityTypeId: model.id,
                entityId: request.targetEntityId || "*",
                relation: request.relation,
                subjectType: "user",
                subjectId: request.userId,
                authorizationSpaceId: request.targetId,
            });
        } else if (request.targetKind === "oauth_client_login" && request.targetId && request.targetId !== "*") {
            // OAuth-client login eligibility, not platform/resource access.
            await tupleRepo.create({
                entityType: "oauth_client_login",
                entityId: request.targetId,
                relation: request.relation,
                subjectType: "user",
                subjectId: request.userId,
            });
        } else {
            // Platform-level permission
            await tupleRepo.create({
                entityType: "platform",
                entityId: "*",
                relation: request.relation,
                subjectType: "user",
                subjectId: request.userId,
            });
        }

        // Update request status
        await permissionRequestRepo.resolve(requestId, "approved", session.user.id);

        // Metric: permission request approved
        void metricsService.count("admin.permission_request.approve.count", 1);

        revalidatePath("/admin/requests");
        return { success: true };
    } catch (error) {
        console.error("approveRequest error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to approve request",
        };
    }
}

export async function rejectRequest(
    requestId: string,
    reason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();
        const session = await getSession();

        if (!session?.user?.id) {
            return { success: false, error: "Not authenticated" };
        }

        // Get the request
        const request = await permissionRequestRepo.findById(requestId);
        if (!request) {
            return { success: false, error: "Request not found" };
        }

        if (request.status !== "pending") {
            return { success: false, error: "Request is not pending" };
        }

        // Update request status
        await permissionRequestRepo.resolve(requestId, "rejected", session.user.id, reason);

        // Metric: permission request rejected
        void metricsService.count("admin.permission_request.reject.count", 1);

        revalidatePath("/admin/requests");
        return { success: true };
    } catch (error) {
        console.error("rejectRequest error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to reject request",
        };
    }
}

// ============================================================================
// Automation Rules
// ============================================================================

export async function getAutomationRules(): Promise<PermissionRule[]> {
    await guards.platform.admin();
    // Find platform rules (clientId = null)
    return permissionRuleRepo.findByClient(null);
}

export async function createAutomationRule(data: {
    relation: string;
    selfRequestable: boolean;
    autoApproveCondition?: string;
    defaultAction: "require_approval" | "auto_approve" | "auto_reject";
}): Promise<{ success: boolean; rule?: PermissionRule; error?: string }> {
    try {
        await guards.platform.admin();

        const rule = await permissionRuleRepo.create({
            clientId: null, // Platform rule
            triggerKind: "platform",
            triggerClientId: null,
            targetKind: "platform",
            targetId: "*",
            relation: data.relation,
            selfRequestable: data.selfRequestable,
            autoApproveCondition: data.autoApproveCondition,
            defaultAction: data.defaultAction,
        });

        revalidatePath("/admin/requests");
        return { success: true, rule };
    } catch (error) {
        console.error("createAutomationRule error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create rule",
        };
    }
}

export async function updateAutomationRule(
    id: string,
    data: {
        selfRequestable?: boolean;
        autoApproveCondition?: string;
        defaultAction?: "require_approval" | "auto_approve" | "auto_reject";
    }
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        await permissionRuleRepo.update(id, data);

        revalidatePath("/admin/requests");
        return { success: true };
    } catch (error) {
        console.error("updateAutomationRule error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update rule",
        };
    }
}

export async function deleteAutomationRule(
    id: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.platform.admin();

        await permissionRuleRepo.delete(id);

        revalidatePath("/admin/requests");
        return { success: true };
    } catch (error) {
        console.error("deleteAutomationRule error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete rule",
        };
    }
}
