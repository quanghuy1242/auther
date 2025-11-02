import { db } from "@/lib/db";
import { userClientAccess, oauthApplication } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { generateApiKeyId } from "@/lib/utils/api-key";
import type { AccessLevel } from "@/lib/utils/access-control";
import { WebhookAwareRepository } from "./webhook-aware-repository";

export interface UserClientAccessEntity {
  id: string;
  userId: string;
  clientId: string;
  accessLevel: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface CreateUserClientAccessData {
  userId: string;
  clientId: string;
  accessLevel: AccessLevel;
  expiresAt?: Date;
}

/**
 * User-Client Access Repository
 * Manages user access to OAuth clients
 * Automatically emits webhook events for access grant/revoke operations
 */
export class UserClientAccessRepository extends WebhookAwareRepository {
  constructor() {
    super({
      entityName: "user-client-access",
      eventMapping: {
        created: "access.granted",
        deleted: "access.revoked",
      },
      getUserId: (data: unknown) => (data as UserClientAccessEntity).userId,
    });
  }

  /**
   * Transform database row to entity
   */
  private toEntity(row: typeof userClientAccess.$inferSelect): UserClientAccessEntity {
    return {
      id: row.id,
      userId: row.userId,
      clientId: row.clientId,
      accessLevel: row.accessLevel,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt || null,
    };
  }

  /**
   * Find access record by user and client
   */
  async findByUserAndClient(
    userId: string,
    clientId: string
  ): Promise<UserClientAccessEntity | null> {
    try {
      const [access] = await db
        .select()
        .from(userClientAccess)
        .where(
          and(
            eq(userClientAccess.userId, userId),
            eq(userClientAccess.clientId, clientId)
          )
        )
        .limit(1);

      return access ? this.toEntity(access) : null;
    } catch (error) {
      console.error("UserClientAccessRepository.findByUserAndClient error:", error);
      return null;
    }
  }

  /**
   * Find all users with access to a client
   */
  async findByClient(clientId: string): Promise<UserClientAccessEntity[]> {
    try {
      const records = await db
        .select()
        .from(userClientAccess)
        .where(eq(userClientAccess.clientId, clientId))
        .orderBy(desc(userClientAccess.createdAt));

      return records.map(record => this.toEntity(record));
    } catch (error) {
      console.error("UserClientAccessRepository.findByClient error:", error);
      return [];
    }
  }

  /**
   * Find all clients accessible by a user
   */
  async findByUser(userId: string): Promise<UserClientAccessEntity[]> {
    try {
      const records = await db
        .select()
        .from(userClientAccess)
        .where(eq(userClientAccess.userId, userId))
        .orderBy(desc(userClientAccess.createdAt));

      return records.map(record => this.toEntity(record));
    } catch (error) {
      console.error("UserClientAccessRepository.findByUser error:", error);
      return [];
    }
  }

  /**
   * Create a new user-client access record
   * Automatically emits access.granted webhook event
   */
  async create(
    data: CreateUserClientAccessData,
    options: { silent?: boolean } = {}
  ): Promise<UserClientAccessEntity> {
    return this.createWithWebhook(async () => {
      const id = `uca_${generateApiKeyId()}`;
      const now = new Date();

      const [record] = await db
        .insert(userClientAccess)
        .values({
          id,
          userId: data.userId,
          clientId: data.clientId,
          accessLevel: data.accessLevel,
          createdAt: now,
          updatedAt: now,
          expiresAt: data.expiresAt || null,
        })
        .returning();

      return this.toEntity(record);
    }, options);
  }

  /**
   * Update an access record
   */
  async update(
    id: string,
    data: Partial<Pick<UserClientAccessEntity, "accessLevel" | "expiresAt">>
  ): Promise<UserClientAccessEntity | null> {
    try {
      const now = new Date();
      const updateData: Partial<typeof userClientAccess.$inferInsert> = {
        updatedAt: now,
      };

      if (data.accessLevel !== undefined) {
        updateData.accessLevel = data.accessLevel;
      }

      if (data.expiresAt !== undefined) {
        updateData.expiresAt = data.expiresAt || null;
      }

      const [updated] = await db
        .update(userClientAccess)
        .set(updateData)
        .where(eq(userClientAccess.id, id))
        .returning();

      return updated ? this.toEntity(updated) : null;
    } catch (error) {
      console.error("UserClientAccessRepository.update error:", error);
      return null;
    }
  }

  /**
   * Delete an access record
   * Automatically emits access.revoked webhook event
   */
  async delete(id: string, options: { silent?: boolean } = {}): Promise<boolean> {
    // Find the access record first to pass to webhook
    const accessData = await db
      .select()
      .from(userClientAccess)
      .where(eq(userClientAccess.id, id))
      .limit(1)
      .then(([record]) => record ? this.toEntity(record) : null);

    if (!accessData) return false;

    return this.deleteWithWebhook(accessData, async () => {
      try {
        await db
          .delete(userClientAccess)
          .where(eq(userClientAccess.id, id));

        return true;
      } catch (error) {
        console.error("UserClientAccessRepository.delete error:", error);
        return false;
      }
    }, options);
  }

  /**
   * Check if user has access to a client
   * Returns access information including level
   */
  async checkAccess(
    userId: string,
    clientId: string
  ): Promise<{ hasAccess: boolean; level: string | null; isExpired: boolean }> {
    try {
      // First check client's access policy
      const [client] = await db
        .select()
        .from(oauthApplication)
        .where(eq(oauthApplication.clientId, clientId))
        .limit(1);

      if (!client) {
        return { hasAccess: false, level: null, isExpired: false };
      }

      // Parse metadata to check access policy
      let accessPolicy = "all_users"; // Default policy
      if (client.metadata) {
        try {
          const metadata = JSON.parse(client.metadata);
          accessPolicy = metadata.accessPolicy || "all_users";
        } catch {
          // Invalid metadata, use default
        }
      }

      // If client allows all users, grant access
      if (accessPolicy === "all_users") {
        return { hasAccess: true, level: "use", isExpired: false };
      }

      // If restricted, check user_client_access table
      const access = await this.findByUserAndClient(userId, clientId);

      if (!access) {
        return { hasAccess: false, level: null, isExpired: false };
      }

      // Check if access has expired
      const now = new Date();
      const isExpired = access.expiresAt ? now > access.expiresAt : false;

      if (isExpired) {
        return { hasAccess: false, level: access.accessLevel, isExpired: true };
      }

      return { hasAccess: true, level: access.accessLevel, isExpired: false };
    } catch (error) {
      console.error("UserClientAccessRepository.checkAccess error:", error);
      return { hasAccess: false, level: null, isExpired: false };
    }
  }
}
