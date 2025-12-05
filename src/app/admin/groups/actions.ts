"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userGroupRepository, tupleRepository } from "@/lib/repositories";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { user } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { createGroupSchema, updateGroupSchema } from "@/schemas/groups";
import type { UserGroupEntity } from "@/lib/repositories";

export interface GroupWithMemberCount extends UserGroupEntity {
    memberCount: number;
}

export interface GetGroupsResult {
    groups: GroupWithMemberCount[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

/**
 * Get paginated groups with member counts
 */
export async function getGroups(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
}): Promise<GetGroupsResult> {
    await requireAdmin();

    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize || 10));

    const result = await userGroupRepository.findMany(page, pageSize, {
        search: params?.search,
    });

    // Enrich with member counts
    const groupsWithCounts = await Promise.all(result.items.map(async (g) => {
        const members = await userGroupRepository.getMembers(g.id);
        return { ...g, memberCount: members.length };
    }));

    return {
        groups: groupsWithCounts,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
    };
}

/**
 * Get a single group by ID
 */
export async function getGroup(id: string) {
    await requireAdmin();
    return userGroupRepository.findById(id);
}

/**
 * Create a new group
 */
export async function createGroup(data: z.infer<typeof createGroupSchema>) {
    await requireAdmin();

    const validated = createGroupSchema.parse(data);
    const group = await userGroupRepository.create(validated);

    revalidatePath("/admin/groups");
    return { success: true, group };
}

/**
 * Update a group
 */
export async function updateGroup(id: string, data: z.infer<typeof updateGroupSchema>) {
    await requireAdmin();

    const validated = updateGroupSchema.parse(data);
    await userGroupRepository.update(id, validated);

    revalidatePath(`/admin/groups/${id}`);
    revalidatePath("/admin/groups");
    return { success: true };
}

/**
 * Delete a group
 */
export async function deleteGroup(id: string) {
    await requireAdmin();

    // 1. Delete group (cascade handles membership in DB usually, but repo handles it)
    await userGroupRepository.delete(id);

    // 2. Delete all permissions (tuples) where this group is the subject
    const tuples = await tupleRepository.findBySubject("group", id);
    for (const t of tuples) {
        await tupleRepository.deleteById(t.id);
    }

    revalidatePath("/admin/groups");
    return { success: true };
}

/**
 * Get members of a group
 */
export async function getGroupMembers(groupId: string) {
    await requireAdmin();

    const memberIds = await userGroupRepository.getMembers(groupId);
    if (memberIds.length === 0) return [];

    const members = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
        })
        .from(user)
        .where(inArray(user.id, memberIds));

    return members;
}

/**
 * Add a member to a group
 */
export async function addGroupMember(groupId: string, userId: string) {
    await requireAdmin();

    // Check if already a member
    const members = await userGroupRepository.getMembers(groupId);
    if (members.includes(userId)) {
        return { success: false, error: "User is already a member" };
    }

    await userGroupRepository.addMember(groupId, userId);

    revalidatePath(`/admin/groups/${groupId}`);
    return { success: true };
}

/**
 * Remove a member from a group
 */
export async function removeGroupMember(groupId: string, userId: string) {
    await requireAdmin();

    await userGroupRepository.removeMember(groupId, userId);

    revalidatePath(`/admin/groups/${groupId}`);
    return { success: true };
}

/**
 * Get permissions for a group (ReBAC tuples)
 */
export async function getGroupPermissions(groupId: string) {
    await requireAdmin();

    const tuples = await tupleRepository.findBySubject("group", groupId);

    return tuples.map(t => ({
        id: t.id,
        entityType: t.entityType,
        entityId: t.entityId,
        relation: t.relation,
        createdAt: t.createdAt,
    }));
}

/**
 * Get all groups a user belongs to
 */
export async function getUserGroups(userId: string) {
    await requireAdmin();
    return userGroupRepository.getUserGroups(userId);
}

