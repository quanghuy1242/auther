import { db } from "@/lib/db";
import { oauthApplication } from "@/db/schema";
import { desc, like, or, eq, count, isNull, isNotNull } from "drizzle-orm";
import { PaginatedResult } from "./base-repository";

export interface OAuthClientMetadata {
  tokenEndpointAuthMethod?: string;
  grantTypes?: string[];
  postLogoutRedirectUris?: string[];
  [key: string]: unknown;
}

export interface OAuthClientEntity {
  id: string;
  name: string | null;
  clientId: string | null;
  type: string | null;
  redirectURLs: string[];
  disabled: boolean;
  metadata: OAuthClientMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  userId: string | null;
}

export interface ClientStats {
  total: number;
  trusted: number;
  dynamic: number;
  disabled: number;
}

export interface GetClientsFilter {
  search?: string;
  type?: "trusted" | "dynamic" | null;
}

/**
 * OAuth Client Repository
 * Handles all database operations related to OAuth clients
 */
export class OAuthClientRepository {
  /**
   * Parse metadata JSON
   */
  private parseMetadata(metadata: string | null): OAuthClientMetadata | null {
    if (!metadata) return null;
    try {
      return JSON.parse(metadata) as OAuthClientMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Parse redirect URLs
   */
  private parseRedirectURLs(redirectURLs: string | null): string[] {
    if (!redirectURLs) return [];
    try {
      const parsed = JSON.parse(redirectURLs);
      return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
    } catch {
      return redirectURLs
        .split(/[\n,]/)
        .map((url: string) => url.trim())
        .filter((url: string) => url.length > 0);
    }
  }

  /**
   * Find client by internal ID
   */
  async findById(id: string): Promise<OAuthClientEntity | null> {
    try {
      const [client] = await db
        .select()
        .from(oauthApplication)
        .where(eq(oauthApplication.id, id))
        .limit(1);

      if (!client) return null;

      return {
        id: client.id,
        name: client.name,
        clientId: client.clientId,
        type: client.type,
        redirectURLs: this.parseRedirectURLs(client.redirectURLs),
        disabled: client.disabled || false,
        metadata: this.parseMetadata(client.metadata),
        createdAt: client.createdAt ? new Date(client.createdAt) : null,
        updatedAt: client.updatedAt ? new Date(client.updatedAt) : null,
        userId: client.userId,
      };
    } catch (error) {
      console.error("OAuthClientRepository.findById error:", error);
      return null;
    }
  }

  /**
   * Find client by OAuth client ID (the public client identifier)
   */
  async findByClientId(clientId: string): Promise<OAuthClientEntity | null> {
    try {
      const [client] = await db
        .select()
        .from(oauthApplication)
        .where(eq(oauthApplication.clientId, clientId))
        .limit(1);

      if (!client) return null;

      return {
        id: client.id,
        name: client.name,
        clientId: client.clientId,
        type: client.type,
        redirectURLs: this.parseRedirectURLs(client.redirectURLs),
        disabled: client.disabled || false,
        metadata: this.parseMetadata(client.metadata),
        createdAt: client.createdAt ? new Date(client.createdAt) : null,
        updatedAt: client.updatedAt ? new Date(client.updatedAt) : null,
        userId: client.userId,
      };
    } catch (error) {
      console.error("OAuthClientRepository.findByClientId error:", error);
      return null;
    }
  }

  /**
   * Get paginated list of OAuth clients
   */
  async findMany(
    page: number,
    pageSize: number,
    filter?: GetClientsFilter
  ): Promise<PaginatedResult<OAuthClientEntity>> {
    try {
      const offset = (page - 1) * pageSize;

      // Build where conditions
      let whereCondition = undefined;

      if (filter?.search) {
        whereCondition = or(
          like(oauthApplication.name, `%${filter.search}%`),
          like(oauthApplication.clientId, `%${filter.search}%`)
        );
      }

      if (filter?.type === "trusted") {
        const typeCondition = isNotNull(oauthApplication.userId);
        whereCondition = whereCondition
          ? or(whereCondition, typeCondition)
          : typeCondition;
      } else if (filter?.type === "dynamic") {
        const typeCondition = isNull(oauthApplication.userId);
        whereCondition = whereCondition
          ? or(whereCondition, typeCondition)
          : typeCondition;
      }

      // Get total count
      const countResult = await db
        .select({ value: count() })
        .from(oauthApplication)
        .where(whereCondition);

      const total = countResult[0]?.value || 0;

      // Get clients
      const clients = await db
        .select()
        .from(oauthApplication)
        .where(whereCondition)
        .orderBy(desc(oauthApplication.createdAt))
        .limit(pageSize)
        .offset(offset);

      // Transform data
      const clientsInfo: OAuthClientEntity[] = clients.map((client) => ({
        id: client.id,
        name: client.name,
        clientId: client.clientId,
        type: client.type,
        redirectURLs: this.parseRedirectURLs(client.redirectURLs),
        disabled: client.disabled || false,
        metadata: this.parseMetadata(client.metadata),
        createdAt: client.createdAt ? new Date(client.createdAt) : null,
        updatedAt: client.updatedAt ? new Date(client.updatedAt) : null,
        userId: client.userId,
      }));

      return {
        items: clientsInfo,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      console.error("OAuthClientRepository.findMany error:", error);
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }
  }

  /**
   * Get OAuth client statistics
   */
  async getStats(): Promise<ClientStats> {
    try {
      const totalResult = await db
        .select({ value: count() })
        .from(oauthApplication);

      const trustedResult = await db
        .select({ value: count() })
        .from(oauthApplication)
        .where(isNotNull(oauthApplication.userId));

      const disabledResult = await db
        .select({ value: count() })
        .from(oauthApplication)
        .where(eq(oauthApplication.disabled, true));

      const total = totalResult[0]?.value || 0;
      const trusted = trustedResult[0]?.value || 0;
      const disabled = disabledResult[0]?.value || 0;

      return {
        total,
        trusted,
        dynamic: total - trusted,
        disabled,
      };
    } catch (error) {
      console.error("OAuthClientRepository.getStats error:", error);
      return {
        total: 0,
        trusted: 0,
        dynamic: 0,
        disabled: 0,
      };
    }
  }
}
