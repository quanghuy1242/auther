"use server";

import { guards } from "@/lib/auth/platform-guard";
import { oauthClientRepository } from "@/lib/repositories";
import type { OAuthClientEntity, ClientStats } from "@/lib/repositories";

// Re-export types
export type { OAuthClientEntity as OAuthClientInfo, ClientStats };

export interface GetClientsResult {
  clients: OAuthClientEntity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
    await guards.clients.view();

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 10));

    const result = await oauthClientRepository.findMany(page, pageSize, {
      search: params.search,
      type: params.type,
    });

    return {
      clients: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
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
    await guards.clients.view();
    return await oauthClientRepository.getStats();
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
