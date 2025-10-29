"use server";

import { db } from "@/lib/db";
import { oauthApplication } from "@/db/schema";
import { desc, like, or, eq, count, isNull, isNotNull } from "drizzle-orm";
import { requireAuth } from "@/lib/session";

export interface OAuthClientMetadata {
  tokenEndpointAuthMethod?: string;
  grantTypes?: string[];
  postLogoutRedirectUris?: string[];
  [key: string]: unknown;
}

export interface OAuthClientInfo {
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

export interface GetClientsResult {
  clients: OAuthClientInfo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ClientStats {
  total: number;
  trusted: number;
  dynamic: number;
  disabled: number;
}

function parseMetadata(metadata: string | null): OAuthClientMetadata | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as OAuthClientMetadata;
  } catch {
    return null;
  }
}

function parseRedirectURLs(redirectURLs: string | null): string[] {
  if (!redirectURLs) return [];
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(redirectURLs);
    return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
  } catch {
    // If JSON parsing fails, treat as plain text (split by newlines or commas)
    return redirectURLs
      .split(/[\n,]/)
      .map((url: string) => url.trim())
      .filter((url: string) => url.length > 0);
  }
}

/**
 * Get paginated list of OAuth clients
 */
export async function getOAuthClients(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: "trusted" | "dynamic" | null;
}): Promise<GetClientsResult> {
  try {
    await requireAuth();

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 10));
    const offset = (page - 1) * pageSize;

    // Build where conditions
    let whereCondition = undefined;

    if (params.search) {
      whereCondition = or(
        like(oauthApplication.name, `%${params.search}%`),
        like(oauthApplication.clientId, `%${params.search}%`)
      );
    }

    if (params.type === "trusted") {
      const typeCondition = isNotNull(oauthApplication.userId);
      whereCondition = whereCondition
        ? or(whereCondition, typeCondition)
        : typeCondition;
    } else if (params.type === "dynamic") {
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
    const clientsInfo: OAuthClientInfo[] = clients.map((client) => ({
      id: client.id,
      name: client.name,
      clientId: client.clientId,
      type: client.type,
      redirectURLs: parseRedirectURLs(client.redirectURLs),
      disabled: client.disabled || false,
      metadata: parseMetadata(client.metadata),
      createdAt: client.createdAt ? new Date(client.createdAt) : null,
      updatedAt: client.updatedAt ? new Date(client.updatedAt) : null,
      userId: client.userId,
    }));

    return {
      clients: clientsInfo,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    console.error("Failed to fetch OAuth clients:", error);
    return {
      clients: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }
}

/**
 * Get OAuth client statistics
 */
export async function getClientStats(): Promise<ClientStats> {
  try {
    await requireAuth();

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
    console.error("Failed to fetch client stats:", error);
    return {
      total: 0,
      trusted: 0,
      dynamic: 0,
      disabled: 0,
    };
  }
}
