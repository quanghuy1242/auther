import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
    registrationContexts,
    platformInvites,
    pendingRegistrationContextApplications,
    permissionRequests,
    permissionRules,
    policyTemplates,
} from "@/db/schema";
import { assertLegacyWriteAllowed } from "@/lib/auth/legacy-write-guard";

// ========================================
// Types
// ========================================

export type RegistrationContext = typeof registrationContexts.$inferSelect;
export type NewRegistrationContext = typeof registrationContexts.$inferInsert;

export type PlatformInvite = typeof platformInvites.$inferSelect;
export type NewPlatformInvite = typeof platformInvites.$inferInsert;

export type PendingRegistrationContextApplication =
    typeof pendingRegistrationContextApplications.$inferSelect;
export type NewPendingRegistrationContextApplication =
    typeof pendingRegistrationContextApplications.$inferInsert;

export type PermissionRequest = typeof permissionRequests.$inferSelect;
export type NewPermissionRequest = typeof permissionRequests.$inferInsert;

export type PermissionRule = typeof permissionRules.$inferSelect;
export type NewPermissionRule = typeof permissionRules.$inferInsert;

export type PolicyTemplate = typeof policyTemplates.$inferSelect;
export type NewPolicyTemplate = typeof policyTemplates.$inferInsert;

// ========================================
// Registration Context Repository
// ========================================

export class RegistrationContextRepository {
    async findBySlug(slug: string): Promise<RegistrationContext | null> {
        const results = await db
            .select()
            .from(registrationContexts)
            .where(eq(registrationContexts.slug, slug))
            .limit(1);
        return results[0] || null;
    }

    async findByClientId(clientId: string): Promise<RegistrationContext[]> {
        return db
            .select()
            .from(registrationContexts)
            .where(
                sql`${registrationContexts.clientId} = ${clientId} OR ${registrationContexts.triggerClientId} = ${clientId}`
            );
    }

    async findPlatformContexts(): Promise<RegistrationContext[]> {
        return db
            .select()
            .from(registrationContexts)
            .where(sql`${registrationContexts.clientId} IS NULL`);
    }

    async findEnabled(): Promise<RegistrationContext[]> {
        return db
            .select()
            .from(registrationContexts)
            .where(eq(registrationContexts.enabled, true));
    }

    async create(
        data: Omit<NewRegistrationContext, "id">
    ): Promise<RegistrationContext> {
        if (!data.triggerKind || !data.targetKind) {
            assertLegacyWriteAllowed({
                category: "nullable_client_registration_context",
                operation: "RegistrationContextRepository.create",
                payload: { slug: data.slug, clientId: data.clientId ?? null },
            });
        }

        const id = crypto.randomUUID();
        await db.insert(registrationContexts).values({ ...data, id });
        return this.findBySlug(data.slug) as Promise<RegistrationContext>;
    }

    async createTargeted(
        data: Omit<NewRegistrationContext, "id" | "clientId"> & {
            triggerKind: string;
            triggerClientId?: string | null;
            targetKind: string;
            targetId: string;
        }
    ): Promise<RegistrationContext> {
        const id = crypto.randomUUID();
        await db.insert(registrationContexts).values({
            ...data,
            id,
            clientId: null,
            triggerClientId: data.triggerClientId ?? null,
        });
        return this.findBySlug(data.slug) as Promise<RegistrationContext>;
    }

    async update(
        slug: string,
        data: Partial<Omit<NewRegistrationContext, "id" | "slug">>
    ): Promise<RegistrationContext | null> {
        await db
            .update(registrationContexts)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(registrationContexts.slug, slug));
        return this.findBySlug(slug);
    }

    async delete(slug: string): Promise<boolean> {
        const result = await db
            .delete(registrationContexts)
            .where(eq(registrationContexts.slug, slug));
        return result.rowsAffected > 0;
    }

    async isOriginAllowed(slug: string, origin: string): Promise<boolean> {
        const context = await this.findBySlug(slug);
        if (!context || !context.enabled) return false;
        if (!context.allowedOrigins || context.allowedOrigins.length === 0) {
            return false;
        }
        return context.allowedOrigins.includes(origin);
    }

    /**
     * Count how many registration context grants use a specific entityTypeId and relation.
     * Used for dependency safety checks before removing relations from models.
     */
    async countGrantsByEntityTypeIdAndRelation(
        entityTypeId: string,
        relation: string
    ): Promise<number> {
        try {
            return await this.countGrantsByEntityTypeIdAndRelationStrict(entityTypeId, relation);
        } catch (error) {
            console.error("RegistrationContextRepository.countGrantsByEntityTypeIdAndRelation error:", error);
            return 0;
        }
    }

    /**
     * Strict grant counting for dependency safety checks.
     * Throws on DB errors so callers can fail closed.
     */
    async countGrantsByEntityTypeIdAndRelationStrict(
        entityTypeId: string,
        relation: string
    ): Promise<number> {
        const allContexts = await db.select().from(registrationContexts);

        let count = 0;
        for (const ctx of allContexts) {
            const grants = ctx.grants as Array<{ entityTypeId: string; relation: string }>;
            for (const grant of grants) {
                if (grant.entityTypeId === entityTypeId && grant.relation === relation) {
                    count++;
                }
            }
        }

        return count;
    }
}

// ========================================
// Pending Registration Context Application Repository
// ========================================

export class PendingRegistrationContextApplicationRepository {
    async findById(id: string): Promise<PendingRegistrationContextApplication | null> {
        const results = await db
            .select()
            .from(pendingRegistrationContextApplications)
            .where(eq(pendingRegistrationContextApplications.id, id))
            .limit(1);
        return results[0] || null;
    }

    async findPendingByEmail(email: string): Promise<PendingRegistrationContextApplication[]> {
        return db
            .select()
            .from(pendingRegistrationContextApplications)
            .where(
                and(
                    eq(pendingRegistrationContextApplications.email, email.toLowerCase()),
                    eq(pendingRegistrationContextApplications.status, "pending")
                )
            );
    }

    async create(
        data: Omit<NewPendingRegistrationContextApplication, "id" | "email">
            & { email: string }
    ): Promise<PendingRegistrationContextApplication> {
        const id = crypto.randomUUID();
        await db
            .insert(pendingRegistrationContextApplications)
            .values({
                ...data,
                id,
                email: data.email.toLowerCase(),
            })
            .onConflictDoNothing({
                target: pendingRegistrationContextApplications.idempotencyKey,
            });

        const existing = await db
            .select()
            .from(pendingRegistrationContextApplications)
            .where(eq(pendingRegistrationContextApplications.idempotencyKey, data.idempotencyKey))
            .limit(1);

        if (!existing[0]) {
            throw new Error("Failed to create pending registration context application");
        }
        return existing[0];
    }

    async markApplied(id: string, userId: string): Promise<boolean> {
        const result = await db
            .update(pendingRegistrationContextApplications)
            .set({
                userId,
                status: "applied",
                appliedAt: new Date(),
                updatedAt: new Date(),
                lastError: null,
            })
            .where(eq(pendingRegistrationContextApplications.id, id));
        return result.rowsAffected > 0;
    }

    async markFailed(id: string, error: string): Promise<boolean> {
        const result = await db
            .update(pendingRegistrationContextApplications)
            .set({
                status: "failed",
                attempts: sql`${pendingRegistrationContextApplications.attempts} + 1`,
                lastError: error,
                updatedAt: new Date(),
            })
            .where(eq(pendingRegistrationContextApplications.id, id));
        return result.rowsAffected > 0;
    }
}

// ========================================
// Platform Invite Repository
// ========================================

export class PlatformInviteRepository {
    async findById(id: string): Promise<PlatformInvite | null> {
        const results = await db
            .select()
            .from(platformInvites)
            .where(eq(platformInvites.id, id))
            .limit(1);
        return results[0] || null;
    }

    async findByTokenHash(hash: string): Promise<PlatformInvite | null> {
        const results = await db
            .select()
            .from(platformInvites)
            .where(eq(platformInvites.tokenHash, hash))
            .limit(1);
        return results[0] || null;
    }

    async findPendingByContext(contextSlug: string): Promise<PlatformInvite[]> {
        return db
            .select()
            .from(platformInvites)
            .where(
                and(
                    eq(platformInvites.contextSlug, contextSlug),
                    sql`${platformInvites.consumedAt} IS NULL`,
                    sql`${platformInvites.expiresAt} > unixepoch()`
                )
            );
    }

    async findByInviter(userId: string): Promise<PlatformInvite[]> {
        return db
            .select()
            .from(platformInvites)
            .where(eq(platformInvites.invitedBy, userId));
    }

    async findByConsumedBy(userId: string): Promise<PlatformInvite | null> {
        const results = await db
            .select()
            .from(platformInvites)
            .where(eq(platformInvites.consumedBy, userId))
            .limit(1);
        return results[0] || null;
    }

    async create(data: Omit<NewPlatformInvite, "id">): Promise<PlatformInvite> {
        const id = crypto.randomUUID();
        await db.insert(platformInvites).values({ ...data, id });
        return this.findById(id) as Promise<PlatformInvite>;
    }

    async markConsumed(id: string, userId: string): Promise<boolean> {
        const result = await db
            .update(platformInvites)
            .set({ consumedAt: new Date(), consumedBy: userId })
            .where(
                and(eq(platformInvites.id, id), sql`${platformInvites.consumedAt} IS NULL`)
            );
        return result.rowsAffected > 0;
    }

    async delete(id: string): Promise<boolean> {
        const result = await db
            .delete(platformInvites)
            .where(eq(platformInvites.id, id));
        return result.rowsAffected > 0;
    }

    async isValid(id: string): Promise<boolean> {
        const invite = await this.findById(id);
        if (!invite) return false;
        if (invite.consumedAt) return false;
        if (new Date(invite.expiresAt) < new Date()) return false;
        return true;
    }
}

// ========================================
// Permission Request Repository
// ========================================

export class PermissionRequestRepository {
    async findById(id: string): Promise<PermissionRequest | null> {
        const results = await db
            .select()
            .from(permissionRequests)
            .where(eq(permissionRequests.id, id))
            .limit(1);
        return results[0] || null;
    }

    async findPendingByClient(
        clientId: string | null
    ): Promise<PermissionRequest[]> {
        if (clientId === null) {
            return db
                .select()
                .from(permissionRequests)
                .where(
                    and(
                        sql`${permissionRequests.clientId} IS NULL`,
                        eq(permissionRequests.status, "pending")
                    )
                );
        }
        return db
            .select()
            .from(permissionRequests)
            .where(
                and(
                    sql`${permissionRequests.clientId} = ${clientId} OR ${permissionRequests.targetId} = ${clientId}`,
                    eq(permissionRequests.status, "pending")
                )
            );
    }

    async findByUser(userId: string): Promise<PermissionRequest[]> {
        return db
            .select()
            .from(permissionRequests)
            .where(eq(permissionRequests.userId, userId));
    }

    async findAllByClient(clientId: string | null): Promise<PermissionRequest[]> {
        if (clientId === null) {
            return db
                .select()
                .from(permissionRequests)
                .where(sql`${permissionRequests.clientId} IS NULL`)
                .orderBy(sql`${permissionRequests.requestedAt} DESC`);
        }
        return db
            .select()
            .from(permissionRequests)
            .where(sql`${permissionRequests.clientId} = ${clientId} OR ${permissionRequests.targetId} = ${clientId}`)
            .orderBy(sql`${permissionRequests.requestedAt} DESC`);
    }

    async create(
        data: Omit<NewPermissionRequest, "id">
    ): Promise<PermissionRequest> {
        if (!data.requestKind || !data.targetKind) {
            assertLegacyWriteAllowed({
                category: "nullable_client_permission_request",
                operation: "PermissionRequestRepository.create",
                payload: {
                    userId: data.userId,
                    clientId: data.clientId ?? null,
                    relation: data.relation,
                },
            });
        }

        const id = crypto.randomUUID();
        await db.insert(permissionRequests).values({ ...data, id });
        return this.findById(id) as Promise<PermissionRequest>;
    }

    async createTargeted(
        data: Omit<NewPermissionRequest, "id" | "clientId"> & {
            requestKind: string;
            targetKind: string;
            targetId: string;
        }
    ): Promise<PermissionRequest> {
        const id = crypto.randomUUID();
        await db.insert(permissionRequests).values({ ...data, id, clientId: null });
        return this.findById(id) as Promise<PermissionRequest>;
    }

    async resolve(
        id: string,
        status: "approved" | "rejected",
        resolvedBy: string,
        note?: string
    ): Promise<PermissionRequest | null> {
        await db
            .update(permissionRequests)
            .set({
                status,
                resolvedBy,
                resolvedAt: new Date(),
                resolutionNote: note,
            })
            .where(eq(permissionRequests.id, id));
        return this.findById(id);
    }

    async exists(
        userId: string,
        clientId: string | null,
        relation: string
    ): Promise<boolean> {
        const conditions = [
            eq(permissionRequests.userId, userId),
            eq(permissionRequests.relation, relation),
            eq(permissionRequests.status, "pending"),
        ];
        if (clientId === null) {
            conditions.push(sql`(
                ${permissionRequests.clientId} IS NULL
                AND (
                    ${permissionRequests.targetKind} IS NULL
                    OR (${permissionRequests.targetKind} = 'platform' AND ${permissionRequests.targetId} = '*')
                )
            )`);
        } else {
            conditions.push(sql`(
                ${permissionRequests.clientId} = ${clientId}
                OR (
                    ${permissionRequests.targetKind} = 'oauth_client_login'
                    AND ${permissionRequests.targetId} = ${clientId}
                )
            )`);
        }
        const results = await db
            .select()
            .from(permissionRequests)
            .where(and(...conditions))
            .limit(1);
        return results.length > 0;
    }
}

// ========================================
// Permission Rule Repository
// ========================================

export class PermissionRuleRepository {
    async findById(id: string): Promise<PermissionRule | null> {
        const results = await db
            .select()
            .from(permissionRules)
            .where(eq(permissionRules.id, id))
            .limit(1);
        return results[0] || null;
    }

    async findByClient(clientId: string | null): Promise<PermissionRule[]> {
        if (clientId === null) {
            return db
                .select()
                .from(permissionRules)
                .where(sql`${permissionRules.clientId} IS NULL`);
        }
        return db
            .select()
            .from(permissionRules)
            .where(
                sql`${permissionRules.clientId} = ${clientId} OR ${permissionRules.triggerClientId} = ${clientId} OR ${permissionRules.targetId} = ${clientId}`
            );
    }

    async findByRelation(
        clientId: string | null,
        relation: string
    ): Promise<PermissionRule | null> {
        const conditions = [eq(permissionRules.relation, relation)];
        if (clientId === null) {
            conditions.push(sql`${permissionRules.clientId} IS NULL`);
        } else {
            conditions.push(
                sql`${permissionRules.clientId} = ${clientId} OR ${permissionRules.targetId} = ${clientId}`
            );
        }
        const results = await db
            .select()
            .from(permissionRules)
            .where(and(...conditions))
            .limit(1);
        return results[0] || null;
    }

    async create(data: Omit<NewPermissionRule, "id">): Promise<PermissionRule> {
        if (!data.triggerKind || !data.targetKind) {
            assertLegacyWriteAllowed({
                category: "nullable_client_permission_rule",
                operation: "PermissionRuleRepository.create",
                payload: { clientId: data.clientId ?? null, relation: data.relation },
            });
        }

        const id = crypto.randomUUID();
        await db.insert(permissionRules).values({ ...data, id });
        return this.findById(id) as Promise<PermissionRule>;
    }

    async createTargeted(
        data: Omit<NewPermissionRule, "id" | "clientId"> & {
            triggerKind: string;
            triggerClientId?: string | null;
            targetKind: string;
            targetId: string;
        }
    ): Promise<PermissionRule> {
        const id = crypto.randomUUID();
        await db.insert(permissionRules).values({
            ...data,
            id,
            clientId: null,
            triggerClientId: data.triggerClientId ?? null,
        });
        return this.findById(id) as Promise<PermissionRule>;
    }

    async update(
        id: string,
        data: Partial<Omit<NewPermissionRule, "id">>
    ): Promise<PermissionRule | null> {
        await db
            .update(permissionRules)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(permissionRules.id, id));
        return this.findById(id);
    }

    async delete(id: string): Promise<boolean> {
        const result = await db
            .delete(permissionRules)
            .where(eq(permissionRules.id, id));
        return result.rowsAffected > 0;
    }

    async isSelfRequestable(
        clientId: string | null,
        relation: string
    ): Promise<boolean> {
        const rule = await this.findByRelation(clientId, relation);
        return rule?.selfRequestable ?? false;
    }
}

// ========================================
// Policy Template Repository
// ========================================

export class PolicyTemplateRepository {
    async findById(id: string): Promise<PolicyTemplate | null> {
        const results = await db
            .select()
            .from(policyTemplates)
            .where(eq(policyTemplates.id, id))
            .limit(1);
        return results[0] || null;
    }

    async findAll(): Promise<PolicyTemplate[]> {
        return db.select().from(policyTemplates);
    }

    async findByCategory(category: string): Promise<PolicyTemplate[]> {
        return db
            .select()
            .from(policyTemplates)
            .where(eq(policyTemplates.category, category));
    }

    async findSystemTemplates(): Promise<PolicyTemplate[]> {
        return db
            .select()
            .from(policyTemplates)
            .where(eq(policyTemplates.isSystem, true));
    }

    async create(data: Omit<NewPolicyTemplate, "id">): Promise<PolicyTemplate> {
        const id = crypto.randomUUID();
        await db.insert(policyTemplates).values({ ...data, id });
        return this.findById(id) as Promise<PolicyTemplate>;
    }

    async update(
        id: string,
        data: Partial<Omit<NewPolicyTemplate, "id">>
    ): Promise<PolicyTemplate | null> {
        const existing = await this.findById(id);
        if (existing?.isSystem) {
            throw new Error("Cannot modify system templates");
        }
        await db
            .update(policyTemplates)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(policyTemplates.id, id));
        return this.findById(id);
    }

    async delete(id: string): Promise<boolean> {
        const existing = await this.findById(id);
        if (existing?.isSystem) {
            throw new Error("Cannot delete system templates");
        }
        const result = await db
            .delete(policyTemplates)
            .where(eq(policyTemplates.id, id));
        return result.rowsAffected > 0;
    }
}

// ========================================
// Export Singleton Instances
// ========================================

export const registrationContextRepo = new RegistrationContextRepository();
export const platformInviteRepo = new PlatformInviteRepository();
export const pendingRegistrationContextApplicationRepo =
    new PendingRegistrationContextApplicationRepository();
export const permissionRequestRepo = new PermissionRequestRepository();
export const permissionRuleRepo = new PermissionRuleRepository();
export const policyTemplateRepo = new PolicyTemplateRepository();
