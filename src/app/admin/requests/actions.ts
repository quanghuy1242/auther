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
import { userRepository } from "@/lib/repositories";
import { metricsService } from "@/lib/services";

// Re-export types
export type { PermissionRequest, PermissionRule };

export interface PermissionRequestWithDetails extends PermissionRequest {
    userName?: string;
    userEmail?: string;
    resolverName?: string;
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

        if (request.clientId) {
            // Client-level permission
            await tupleRepo.create({
                entityType: `client_${request.clientId}`,
                entityId: "*",
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
