"use server";

import { guards } from "@/lib/auth/platform-guard";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { TupleRepository } from "@/lib/repositories/tuple-repository";
import {
    policyTemplateRepo,
    platformInviteRepo,
    registrationContextRepo,
    type PolicyTemplate,
} from "@/lib/repositories/platform-access-repository";
import { oauthClientRepository } from "@/lib/repositories";

// Types
export interface UserPermission {
    id: string;
    entityType: string;
    entityId: string;
    relation: string;
    clientName?: string;
    createdAt: Date;
}

export interface UserPermissionsData {
    platformPermissions: UserPermission[];
    clientPermissions: { clientId: string; clientName: string; permissions: UserPermission[] }[];
    registrationContext?: string;
}

// ============================================================================
// User Permissions
// ============================================================================

export async function getUserPermissions(userId: string): Promise<UserPermissionsData> {
    await guards.users.view();

    const tupleRepo = new TupleRepository();

    // Get all tuples where user is the subject
    const allTuples = await tupleRepo.findBySubject("user", userId);

    // Separate platform vs client permissions
    const platformPermissions: UserPermission[] = [];
    const clientPermissionsMap = new Map<string, UserPermission[]>();

    for (const tuple of allTuples) {
        const permission: UserPermission = {
            id: tuple.id,
            entityType: tuple.entityType,
            entityId: tuple.entityId,
            relation: tuple.relation,
            createdAt: tuple.createdAt,
        };

        if (tuple.entityType === "platform") {
            platformPermissions.push(permission);
        } else if (tuple.entityType.startsWith("client_")) {
            const clientId = tuple.entityType.replace("client_", "");
            const existing = clientPermissionsMap.get(clientId) || [];
            existing.push(permission);
            clientPermissionsMap.set(clientId, existing);
        }
    }

    // Get client names
    const clientIds = Array.from(clientPermissionsMap.keys());
    const clientPermissions: { clientId: string; clientName: string; permissions: UserPermission[] }[] = [];

    if (clientIds.length > 0) {
        // Get all clients
        const { items: clients } = await oauthClientRepository.findMany(1, 1000);
        const clientMap = new Map<string, string>(
            clients
                .filter((c): c is typeof c & { clientId: string } => c.clientId !== null)
                .map(c => [c.clientId, c.name || "Unnamed Client"])
        );

        for (const [clientId, permissions] of clientPermissionsMap) {
            const clientName = clientMap.get(clientId) || clientId;
            clientPermissions.push({
                clientId,
                clientName,
                permissions: permissions.map(p => ({ ...p, clientName })),
            });
        }
    }

    // Get registration context from consumed invite
    let registrationContext: string | undefined;
    const consumedInvite = await platformInviteRepo.findByConsumedBy(userId);
    if (consumedInvite) {
        const context = await registrationContextRepo.findBySlug(consumedInvite.contextSlug);
        registrationContext = context?.name || consumedInvite.contextSlug;
    }

    return {
        platformPermissions,
        clientPermissions,
        registrationContext,
    };
}

export async function revokeUserPermission(
    userId: string,
    tupleId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.users.update();

        const tupleRepo = new TupleRepository();

        // Verify the tuple belongs to this user
        const tuple = await tupleRepo.findById(tupleId);
        if (!tuple) {
            return { success: false, error: "Permission not found" };
        }

        if (tuple.subjectType !== "user" || tuple.subjectId !== userId) {
            return { success: false, error: "Permission does not belong to this user" };
        }

        await tupleRepo.deleteById(tupleId);

        revalidatePath(`/admin/users/${userId}`);
        return { success: true };
    } catch (error) {
        console.error("revokeUserPermission error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to revoke permission",
        };
    }
}

export async function addUserPermission(
    userId: string,
    data: {
        entityType: string;
        relation: string;
        clientId?: string;
    }
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.users.update();

        const tupleRepo = new TupleRepository();

        const entityType = data.clientId ? `client_${data.clientId}` : data.entityType;

        await tupleRepo.create({
            entityType,
            entityId: "*",
            relation: data.relation,
            subjectType: "user",
            subjectId: userId,
        });

        revalidatePath(`/admin/users/${userId}`);
        return { success: true };
    } catch (error) {
        console.error("addUserPermission error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to add permission",
        };
    }
}

// ============================================================================
// Policy Templates
// ============================================================================

export async function getPolicyTemplates(): Promise<PolicyTemplate[]> {
    await guards.users.view();
    return policyTemplateRepo.findAll();
}

export async function applyTemplateToUser(
    userId: string,
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.users.update();

        const template = await policyTemplateRepo.findById(templateId);
        if (!template) {
            return { success: false, error: "Template not found" };
        }

        const tupleRepo = new TupleRepository();

        // Apply each permission from the template
        for (const perm of template.permissions) {
            const entityType = perm.entityType || "platform";

            // Use createIfNotExists for idempotency
            await tupleRepo.createIfNotExists({
                entityType,
                entityId: "*",
                relation: perm.relation,
                subjectType: "user",
                subjectId: userId,
            });
        }

        revalidatePath(`/admin/users/${userId}`);
        return { success: true };
    } catch (error) {
        console.error("applyTemplateToUser error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to apply template",
        };
    }
}
