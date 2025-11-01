import { db } from "@/lib/db";
import { userGroup, groupMembership } from "@/db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";
import { generateApiKeyId } from "@/lib/utils/api-key";

export interface UserGroupEntity {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserGroupData {
  name: string;
  description?: string;
}

/**
 * User Group Repository
 * Manages user groups for access control
 */
export class UserGroupRepository {
  /**
   * Transform database row to entity
   */
  private toEntity(row: typeof userGroup.$inferSelect): UserGroupEntity {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Find group by ID
   */
  async findById(id: string): Promise<UserGroupEntity | null> {
    try {
      const [group] = await db
        .select()
        .from(userGroup)
        .where(eq(userGroup.id, id))
        .limit(1);

      return group ? this.toEntity(group) : null;
    } catch (error) {
      console.error("UserGroupRepository.findById error:", error);
      return null;
    }
  }

  /**
   * Find group by name
   */
  async findByName(name: string): Promise<UserGroupEntity | null> {
    try {
      const [group] = await db
        .select()
        .from(userGroup)
        .where(eq(userGroup.name, name))
        .limit(1);

      return group ? this.toEntity(group) : null;
    } catch (error) {
      console.error("UserGroupRepository.findByName error:", error);
      return null;
    }
  }

  /**
   * Find all groups
   */
  async findAll(): Promise<UserGroupEntity[]> {
    try {
      const groups = await db
        .select()
        .from(userGroup)
        .orderBy(desc(userGroup.createdAt));

      return groups.map(group => this.toEntity(group));
    } catch (error) {
      console.error("UserGroupRepository.findAll error:", error);
      return [];
    }
  }

  /**
   * Create a new group
   */
  async create(data: CreateUserGroupData): Promise<UserGroupEntity> {
    const id = `ug_${generateApiKeyId()}`;
    const now = new Date();

    const [record] = await db
      .insert(userGroup)
      .values({
        id,
        name: data.name,
        description: data.description || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.toEntity(record);
  }

  /**
   * Update a group
   */
  async update(
    id: string,
    data: Partial<Pick<UserGroupEntity, "name" | "description">>
  ): Promise<UserGroupEntity | null> {
    try {
      const now = new Date();
      const updateData: Partial<typeof userGroup.$inferInsert> = {
        updatedAt: now,
      };

      if (data.name !== undefined) {
        updateData.name = data.name;
      }

      if (data.description !== undefined) {
        updateData.description = data.description;
      }

      const [updated] = await db
        .update(userGroup)
        .set(updateData)
        .where(eq(userGroup.id, id))
        .returning();

      return updated ? this.toEntity(updated) : null;
    } catch (error) {
      console.error("UserGroupRepository.update error:", error);
      return null;
    }
  }

  /**
   * Delete a group
   */
  async delete(id: string): Promise<boolean> {
    try {
      await db.delete(userGroup).where(eq(userGroup.id, id));
      return true;
    } catch (error) {
      console.error("UserGroupRepository.delete error:", error);
      return false;
    }
  }

  /**
   * Add a user to a group
   */
  async addMember(groupId: string, userId: string): Promise<void> {
    const id = `ugm_${generateApiKeyId()}`;
    const now = new Date();

    await db.insert(groupMembership).values({
      id,
      groupId,
      userId,
      createdAt: now,
    });
  }

  /**
   * Remove a user from a group
   */
  async removeMember(groupId: string, userId: string): Promise<void> {
    await db
      .delete(groupMembership)
      .where(
        and(
          eq(groupMembership.groupId, groupId),
          eq(groupMembership.userId, userId)
        )
      );
  }

  /**
   * Get all member user IDs for a group
   */
  async getMembers(groupId: string): Promise<string[]> {
    try {
      const members = await db
        .select({ userId: groupMembership.userId })
        .from(groupMembership)
        .where(eq(groupMembership.groupId, groupId));

      return members.map(m => m.userId);
    } catch (error) {
      console.error("UserGroupRepository.getMembers error:", error);
      return [];
    }
  }

  /**
   * Get all groups a user belongs to
   */
  async getUserGroups(userId: string): Promise<UserGroupEntity[]> {
    try {
      const memberships = await db
        .select({ groupId: groupMembership.groupId })
        .from(groupMembership)
        .where(eq(groupMembership.userId, userId));

      if (memberships.length === 0) {
        return [];
      }

      const groupIds = memberships.map(m => m.groupId);
      const groups = await db
        .select()
        .from(userGroup)
        .where(inArray(userGroup.id, groupIds));

      return groups.map(group => this.toEntity(group));
    } catch (error) {
      console.error("UserGroupRepository.getUserGroups error:", error);
      return [];
    }
  }
}
