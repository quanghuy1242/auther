import { db } from "@/lib/db";
import { abacAuditLogs, policyVersions } from "@/db/abac-schema";
import { desc, eq, and, gte, lte } from "drizzle-orm";

export interface AuditLogEntry {
    id: string;
    entityType: string;
    entityId: string;
    permission: string;
    subjectType: string;
    subjectId: string;
    policySource: "tuple" | "permission";
    policyScript?: string;
    result: "allowed" | "denied" | "error";
    errorMessage?: string;
    contextSnapshot?: Record<string, unknown>;
    executionTimeMs?: number;
    requestIp?: string;
    requestUserAgent?: string;
    createdAt: Date;
}

export interface CreateAuditLogParams {
    entityType: string;
    entityId: string;
    permission: string;
    subjectType: string;
    subjectId: string;
    policySource: "tuple" | "permission";
    policyScript?: string;
    result: "allowed" | "denied" | "error";
    errorMessage?: string;
    context?: Record<string, unknown>;
    executionTimeMs?: number;
    requestIp?: string;
    requestUserAgent?: string;
}

export interface PolicyVersion {
    id: string;
    entityType: string;
    permissionName: string;
    policyLevel: "permission" | "tuple";
    tupleId?: string;
    policyScript: string;
    version: number;
    changedByType?: string;
    changedById?: string;
    changeReason?: string;
    createdAt: Date;
}

export class ABACRepository {
    // ============================================================================
    // Audit Logging
    // ============================================================================

    /**
     * Log an ABAC policy evaluation for auditing.
     */
    async logPolicyEvaluation(params: CreateAuditLogParams): Promise<void> {
        try {
            await db.insert(abacAuditLogs).values({
                id: crypto.randomUUID(),
                entityType: params.entityType,
                entityId: params.entityId,
                permission: params.permission,
                subjectType: params.subjectType,
                subjectId: params.subjectId,
                policySource: params.policySource,
                policyScript: params.policyScript,
                result: params.result,
                errorMessage: params.errorMessage,
                contextSnapshot: params.context as Record<string, unknown>,
                executionTimeMs: params.executionTimeMs,
                requestIp: params.requestIp,
                requestUserAgent: params.requestUserAgent,
            });
        } catch (error) {
            // Don't fail the request if audit logging fails
            console.error("ABACRepository.logPolicyEvaluation error:", error);
        }
    }

    /**
     * Query audit logs with filters.
     */
    async getAuditLogs(filters: {
        entityType?: string;
        entityId?: string;
        subjectType?: string;
        subjectId?: string;
        result?: "allowed" | "denied" | "error";
        fromDate?: Date;
        toDate?: Date;
        limit?: number;
    }): Promise<AuditLogEntry[]> {
        const conditions = [];

        if (filters.entityType) {
            conditions.push(eq(abacAuditLogs.entityType, filters.entityType));
        }
        if (filters.entityId) {
            conditions.push(eq(abacAuditLogs.entityId, filters.entityId));
        }
        if (filters.subjectType) {
            conditions.push(eq(abacAuditLogs.subjectType, filters.subjectType));
        }
        if (filters.subjectId) {
            conditions.push(eq(abacAuditLogs.subjectId, filters.subjectId));
        }
        if (filters.result) {
            conditions.push(eq(abacAuditLogs.result, filters.result));
        }
        if (filters.fromDate) {
            conditions.push(gte(abacAuditLogs.createdAt, filters.fromDate));
        }
        if (filters.toDate) {
            conditions.push(lte(abacAuditLogs.createdAt, filters.toDate));
        }

        const results = await db
            .select()
            .from(abacAuditLogs)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(abacAuditLogs.createdAt))
            .limit(filters.limit ?? 100);

        return results.map(r => ({
            id: r.id,
            entityType: r.entityType,
            entityId: r.entityId,
            permission: r.permission,
            subjectType: r.subjectType,
            subjectId: r.subjectId,
            policySource: r.policySource as "tuple" | "permission",
            policyScript: r.policyScript ?? undefined,
            result: r.result as "allowed" | "denied" | "error",
            errorMessage: r.errorMessage ?? undefined,
            contextSnapshot: r.contextSnapshot as Record<string, unknown> | undefined,
            executionTimeMs: r.executionTimeMs ?? undefined,
            requestIp: r.requestIp ?? undefined,
            requestUserAgent: r.requestUserAgent ?? undefined,
            createdAt: r.createdAt,
        }));
    }

    // ============================================================================
    // Policy Version History
    // ============================================================================

    /**
     * Save a new version of a policy.
     */
    async savePolicyVersion(params: {
        entityType: string;
        permissionName: string;
        policyLevel: "permission" | "tuple";
        tupleId?: string;
        policyScript: string;
        changedByType?: string;
        changedById?: string;
        changeReason?: string;
    }): Promise<PolicyVersion> {
        // Get current max version
        const existing = await db
            .select({ version: policyVersions.version })
            .from(policyVersions)
            .where(
                and(
                    eq(policyVersions.entityType, params.entityType),
                    eq(policyVersions.permissionName, params.permissionName),
                    eq(policyVersions.policyLevel, params.policyLevel),
                    params.tupleId
                        ? eq(policyVersions.tupleId, params.tupleId)
                        : undefined
                )
            )
            .orderBy(desc(policyVersions.version))
            .limit(1);

        const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

        const [result] = await db
            .insert(policyVersions)
            .values({
                id: crypto.randomUUID(),
                entityType: params.entityType,
                permissionName: params.permissionName,
                policyLevel: params.policyLevel,
                tupleId: params.tupleId,
                policyScript: params.policyScript,
                version: nextVersion,
                changedByType: params.changedByType,
                changedById: params.changedById,
                changeReason: params.changeReason,
            })
            .returning();

        return {
            id: result.id,
            entityType: result.entityType,
            permissionName: result.permissionName,
            policyLevel: result.policyLevel as "permission" | "tuple",
            tupleId: result.tupleId ?? undefined,
            policyScript: result.policyScript,
            version: result.version,
            changedByType: result.changedByType ?? undefined,
            changedById: result.changedById ?? undefined,
            changeReason: result.changeReason ?? undefined,
            createdAt: result.createdAt,
        };
    }

    /**
     * Get version history for a policy.
     */
    async getPolicyVersions(params: {
        entityType: string;
        permissionName: string;
        policyLevel?: "permission" | "tuple";
        tupleId?: string;
        limit?: number;
    }): Promise<PolicyVersion[]> {
        const conditions = [
            eq(policyVersions.entityType, params.entityType),
            eq(policyVersions.permissionName, params.permissionName),
        ];

        if (params.policyLevel) {
            conditions.push(eq(policyVersions.policyLevel, params.policyLevel));
        }
        if (params.tupleId) {
            conditions.push(eq(policyVersions.tupleId, params.tupleId));
        }

        const results = await db
            .select()
            .from(policyVersions)
            .where(and(...conditions))
            .orderBy(desc(policyVersions.version))
            .limit(params.limit ?? 50);

        return results.map(r => ({
            id: r.id,
            entityType: r.entityType,
            permissionName: r.permissionName,
            policyLevel: r.policyLevel as "permission" | "tuple",
            tupleId: r.tupleId ?? undefined,
            policyScript: r.policyScript,
            version: r.version,
            changedByType: r.changedByType ?? undefined,
            changedById: r.changedById ?? undefined,
            changeReason: r.changeReason ?? undefined,
            createdAt: r.createdAt,
        }));
    }
}

export const abacRepository = new ABACRepository();
