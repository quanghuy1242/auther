import { db } from "@/lib/db";
import { oauthClientMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateApiKeyId } from "@/lib/utils/api-key";
import type { ResourcePermissions } from "@/lib/utils/permissions";
import { parsePermissions, stringifyPermissions } from "@/lib/utils/permissions";

export interface OAuthClientMetadataEntity {
  id: string;
  clientId: string;
  allowedResources: ResourcePermissions;
  allowsApiKeys: boolean;
  defaultApiKeyPermissions: ResourcePermissions;
  accessPolicy: "all_users" | "restricted";
  allowsRegistrationContexts: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOAuthClientMetadataData {
  clientId: string;
  allowedResources?: ResourcePermissions;
  allowsApiKeys?: boolean;
  defaultApiKeyPermissions?: ResourcePermissions;
  accessPolicy?: "all_users" | "restricted";
  allowsRegistrationContexts?: boolean;
}

/**
 * OAuth Client Metadata Repository
 * Manages extended metadata for OAuth clients
 */
export class OAuthClientMetadataRepository {
  /**
   * Transform database row to entity
   */
  private toEntity(row: typeof oauthClientMetadata.$inferSelect): OAuthClientMetadataEntity {
    return {
      id: row.id,
      clientId: row.clientId,
      allowedResources: parsePermissions(row.allowedResources),
      allowsApiKeys: row.allowsApiKeys,
      defaultApiKeyPermissions: parsePermissions(row.defaultApiKeyPermissions),
      accessPolicy: row.accessPolicy as "all_users" | "restricted",
      allowsRegistrationContexts: row.allowsRegistrationContexts ?? false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Find metadata by client ID
   */
  async findByClientId(clientId: string): Promise<OAuthClientMetadataEntity | null> {
    try {
      const [metadata] = await db
        .select()
        .from(oauthClientMetadata)
        .where(eq(oauthClientMetadata.clientId, clientId))
        .limit(1);

      return metadata ? this.toEntity(metadata) : null;
    } catch (error) {
      console.error("OAuthClientMetadataRepository.findByClientId error:", error);
      return null;
    }
  }

  /**
   * Create metadata for a client
   */
  async create(data: CreateOAuthClientMetadataData): Promise<OAuthClientMetadataEntity> {
    const id = `ocm_${generateApiKeyId()}`;
    const now = new Date();

    const values = {
      id,
      clientId: data.clientId,
      allowedResources: data.allowedResources
        ? stringifyPermissions(data.allowedResources)
        : "{}",
      allowsApiKeys: data.allowsApiKeys ?? false,
      defaultApiKeyPermissions: data.defaultApiKeyPermissions
        ? stringifyPermissions(data.defaultApiKeyPermissions)
        : "{}",
      accessPolicy: data.accessPolicy ?? "all_users",
      allowsRegistrationContexts: data.allowsRegistrationContexts ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const [record] = await db
      .insert(oauthClientMetadata)
      .values(values)
      .onConflictDoUpdate({
        target: oauthClientMetadata.clientId,
        set: {
          allowedResources: values.allowedResources,
          allowsApiKeys: values.allowsApiKeys,
          defaultApiKeyPermissions: values.defaultApiKeyPermissions,
          accessPolicy: values.accessPolicy,
          allowsRegistrationContexts: values.allowsRegistrationContexts,
          updatedAt: now,
        },
      })
      .returning();

    return this.toEntity(record);
  }

  /**
   * Update metadata
   */
  async update(
    clientId: string,
    data: Partial<Omit<OAuthClientMetadataEntity, "id" | "clientId" | "createdAt" | "updatedAt">>
  ): Promise<OAuthClientMetadataEntity | null> {
    try {
      const now = new Date();
      const updateData: Partial<typeof oauthClientMetadata.$inferInsert> = {
        updatedAt: now,
      };

      if (data.allowedResources !== undefined) {
        updateData.allowedResources = stringifyPermissions(data.allowedResources);
      }

      if (data.allowsApiKeys !== undefined) {
        updateData.allowsApiKeys = data.allowsApiKeys;
      }

      if (data.defaultApiKeyPermissions !== undefined) {
        updateData.defaultApiKeyPermissions = stringifyPermissions(data.defaultApiKeyPermissions);
      }

      if (data.accessPolicy !== undefined) {
        updateData.accessPolicy = data.accessPolicy;
      }

      if (data.allowsRegistrationContexts !== undefined) {
        updateData.allowsRegistrationContexts = data.allowsRegistrationContexts;
      }

      const [updated] = await db
        .update(oauthClientMetadata)
        .set(updateData)
        .where(eq(oauthClientMetadata.clientId, clientId))
        .returning();

      return updated ? this.toEntity(updated) : null;
    } catch (error) {
      console.error("OAuthClientMetadataRepository.update error:", error);
      return null;
    }
  }

  /**
   * Delete metadata
   */
  async delete(clientId: string): Promise<boolean> {
    try {
      await db
        .delete(oauthClientMetadata)
        .where(eq(oauthClientMetadata.clientId, clientId));

      return true;
    } catch (error) {
      console.error("OAuthClientMetadataRepository.delete error:", error);
      return false;
    }
  }

  /**
   * Find or create metadata for a client
   * Useful for ensuring metadata exists
   */
  async findOrCreate(clientId: string): Promise<OAuthClientMetadataEntity> {
    const existing = await this.findByClientId(clientId);

    if (existing) {
      return existing;
    }

    return await this.create({ clientId });
  }

  /**
   * Get all clients that allow API keys
   */
  async findClientsWithApiKeysEnabled(): Promise<OAuthClientMetadataEntity[]> {
    try {
      const records = await db
        .select()
        .from(oauthClientMetadata)
        .where(eq(oauthClientMetadata.allowsApiKeys, true));

      return records.map(record => this.toEntity(record));
    } catch (error) {
      console.error("OAuthClientMetadataRepository.findClientsWithApiKeysEnabled error:", error);
      return [];
    }
  }
}
