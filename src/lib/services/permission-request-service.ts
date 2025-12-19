import {
    permissionRequestRepo,
    permissionRuleRepo,
    PermissionRequest,
    PermissionRule,
} from "@/lib/repositories/platform-access-repository";
import { TupleRepository } from "@/lib/repositories/tuple-repository";
import { LuaPolicyEngine } from "@/lib/auth/policy-engine";

const tupleRepo = new TupleRepository();
const policyEngine = new LuaPolicyEngine();

export interface RequestResult {
    success: boolean;
    request?: PermissionRequest;
    autoApproved?: boolean;
    autoRejected?: boolean;
    error?: string;
}

export interface RequestContext {
    user: {
        id: string;
        email: string;
        name: string;
        createdAt: Date;
    };
    request: {
        relation: string;
        reason?: string;
        clientId?: string;
    };
}

/**
 * Service for managing permission requests and evaluating rules.
 */
export class PermissionRequestService {
    /**
     * Submit a permission request.
     * This will check rules and potentially auto-approve or auto-reject.
     */
    async submitRequest(
        userId: string,
        relation: string,
        clientId: string | null,
        reason?: string,
        userContext?: Partial<RequestContext["user"]>
    ): Promise<RequestResult> {
        // Check if a pending request already exists
        const exists = await permissionRequestRepo.exists(userId, clientId, relation);
        if (exists) {
            return { success: false, error: "A pending request for this permission already exists" };
        }

        // Get the rule for this relation
        const rule = await permissionRuleRepo.findByRelation(clientId, relation);

        // Check if self-requestable
        if (rule && !rule.selfRequestable) {
            return { success: false, error: "This permission cannot be self-requested" };
        }

        // Create request context for Lua evaluation
        const context: RequestContext = {
            user: {
                id: userId,
                email: userContext?.email || "",
                name: userContext?.name || "",
                createdAt: userContext?.createdAt || new Date(),
            },
            request: {
                relation,
                reason,
                clientId: clientId || undefined,
            },
        };

        // Evaluate auto-reject first
        if (rule?.autoRejectCondition) {
            try {
                const shouldReject = await this.evaluateCondition(
                    rule.autoRejectCondition,
                    context
                );
                if (shouldReject) {
                    // Create request and immediately reject
                    const request = await permissionRequestRepo.create({
                        userId,
                        clientId,
                        relation,
                        reason,
                        status: "rejected",
                        resolvedAt: new Date(),
                        resolutionNote: "Auto-rejected by rule",
                    });
                    return { success: true, request, autoRejected: true };
                }
            } catch (error) {
                console.error("Auto-reject condition error:", error);
            }
        }

        // Evaluate auto-approve
        if (rule?.autoApproveCondition) {
            try {
                const shouldApprove = await this.evaluateCondition(
                    rule.autoApproveCondition,
                    context
                );
                if (shouldApprove) {
                    // Create request and immediately approve
                    const request = await permissionRequestRepo.create({
                        userId,
                        clientId,
                        relation,
                        reason,
                        status: "approved",
                        resolvedAt: new Date(),
                        resolutionNote: "Auto-approved by rule",
                    });

                    // Grant the permission
                    await this.grantPermission(userId, clientId, relation);

                    return { success: true, request, autoApproved: true };
                }
            } catch (error) {
                console.error("Auto-approve condition error:", error);
            }
        }

        // Check default action
        const defaultAction = rule?.defaultAction || "require_approval";
        if (defaultAction === "auto_approve") {
            const request = await permissionRequestRepo.create({
                userId,
                clientId,
                relation,
                reason,
                status: "approved",
                resolvedAt: new Date(),
                resolutionNote: "Auto-approved by default rule",
            });
            await this.grantPermission(userId, clientId, relation);
            return { success: true, request, autoApproved: true };
        }

        if (defaultAction === "auto_reject") {
            const request = await permissionRequestRepo.create({
                userId,
                clientId,
                relation,
                reason,
                status: "rejected",
                resolvedAt: new Date(),
                resolutionNote: "Auto-rejected by default rule",
            });
            return { success: true, request, autoRejected: true };
        }

        // Default: require approval, create pending request
        const request = await permissionRequestRepo.create({
            userId,
            clientId,
            relation,
            reason,
            status: "pending",
        });

        return { success: true, request };
    }

    /**
     * Approve a permission request.
     */
    async approveRequest(
        requestId: string,
        approvedBy: string,
        note?: string
    ): Promise<PermissionRequest | null> {
        const request = await permissionRequestRepo.findById(requestId);
        if (!request) {
            throw new Error("Request not found");
        }

        if (request.status !== "pending") {
            throw new Error("Request has already been resolved");
        }

        // Grant the permission
        await this.grantPermission(
            request.userId,
            request.clientId,
            request.relation
        );

        // Update request status
        return permissionRequestRepo.resolve(requestId, "approved", approvedBy, note);
    }

    /**
     * Reject a permission request.
     */
    async rejectRequest(
        requestId: string,
        rejectedBy: string,
        note?: string
    ): Promise<PermissionRequest | null> {
        const request = await permissionRequestRepo.findById(requestId);
        if (!request) {
            throw new Error("Request not found");
        }

        if (request.status !== "pending") {
            throw new Error("Request has already been resolved");
        }

        return permissionRequestRepo.resolve(requestId, "rejected", rejectedBy, note);
    }

    /**
     * Get pending requests for a client (or platform if null).
     */
    async getPendingRequests(clientId: string | null): Promise<PermissionRequest[]> {
        return permissionRequestRepo.findPendingByClient(clientId);
    }

    /**
     * Get all requests for a user.
     */
    async getUserRequests(userId: string): Promise<PermissionRequest[]> {
        return permissionRequestRepo.findByUser(userId);
    }

    /**
     * Check if a relation is requestable.
     */
    async isRequestable(
        clientId: string | null,
        relation: string
    ): Promise<boolean> {
        return permissionRuleRepo.isSelfRequestable(clientId, relation);
    }

    /**
     * Get the rule for a relation.
     */
    async getRule(
        clientId: string | null,
        relation: string
    ): Promise<PermissionRule | null> {
        return permissionRuleRepo.findByRelation(clientId, relation);
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Grant a permission by creating an access tuple.
     */
    private async grantPermission(
        userId: string,
        clientId: string | null,
        relation: string
    ): Promise<void> {
        if (clientId) {
            // Client-level permission
            await tupleRepo.createIfNotExists({
                entityType: `client_${clientId}`,
                entityId: clientId,
                relation,
                subjectType: "user",
                subjectId: userId,
            });
        } else {
            // Platform-level permission
            // Note: For platform permissions, we need entity type from the relation
            // This assumes the relation format follows convention
            await tupleRepo.createIfNotExists({
                entityType: "platform",
                entityId: "*",
                relation,
                subjectType: "user",
                subjectId: userId,
            });
        }
    }

    /**
     * Evaluate a Lua condition script.
     */
    private async evaluateCondition(
        script: string,
        context: RequestContext
    ): Promise<boolean> {
        try {
            const result = await policyEngine.execute(
                script,
                context as unknown as Record<string, unknown>
            );
            return result === true;
        } catch (error) {
            console.error("Lua condition evaluation error:", error);
            return false;
        }
    }
}

// Export singleton instance
export const permissionRequestService = new PermissionRequestService();
