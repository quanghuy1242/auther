import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
    registrationContexts,
    platformInvites,
    permissionRequests,
    permissionRules,
    policyTemplates,
} from "@/db/schema";

// ========================================
// Types
// ========================================

export type RegistrationContext = typeof registrationContexts.$inferSelect;
export type NewRegistrationContext = typeof registrationContexts.$inferInsert;

export type PlatformInvite = typeof platformInvites.$inferSelect;
export type NewPlatformInvite = typeof platformInvites.$inferInsert;

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
            .where(eq(registrationContexts.clientId, clientId));
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
        const id = crypto.randomUUID();
        await db.insert(registrationContexts).values({ ...data, id });
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
                    eq(permissionRequests.clientId, clientId),
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

    async create(
        data: Omit<NewPermissionRequest, "id">
    ): Promise<PermissionRequest> {
        const id = crypto.randomUUID();
        await db.insert(permissionRequests).values({ ...data, id });
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
            conditions.push(sql`${permissionRequests.clientId} IS NULL`);
        } else {
            conditions.push(eq(permissionRequests.clientId, clientId));
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
            .where(eq(permissionRules.clientId, clientId));
    }

    async findByRelation(
        clientId: string | null,
        relation: string
    ): Promise<PermissionRule | null> {
        const conditions = [eq(permissionRules.relation, relation)];
        if (clientId === null) {
            conditions.push(sql`${permissionRules.clientId} IS NULL`);
        } else {
            conditions.push(eq(permissionRules.clientId, clientId));
        }
        const results = await db
            .select()
            .from(permissionRules)
            .where(and(...conditions))
            .limit(1);
        return results[0] || null;
    }

    async create(data: Omit<NewPermissionRule, "id">): Promise<PermissionRule> {
        const id = crypto.randomUUID();
        await db.insert(permissionRules).values({ ...data, id });
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
export const permissionRequestRepo = new PermissionRequestRepository();
export const permissionRuleRepo = new PermissionRuleRepository();
export const policyTemplateRepo = new PolicyTemplateRepository();
