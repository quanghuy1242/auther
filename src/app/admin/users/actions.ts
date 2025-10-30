"use server";

import { requireAuth } from "@/lib/session";
import { userRepository } from "@/lib/repositories";
import type { UserWithAccounts, UserStats } from "@/lib/repositories";

export type { UserWithAccounts, UserStats };

export interface GetUsersResult {
  users: UserWithAccounts[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get paginated list of users with their OAuth accounts
 */
export async function getUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  verified?: boolean | null;
}): Promise<GetUsersResult> {
  try {
    await requireAuth();

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 10));

    const result = await userRepository.findManyWithAccounts(page, pageSize, {
      search: params.search,
      verified: params.verified,
    });

    return {
      users: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return {
      users: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(): Promise<UserStats> {
  try {
    await requireAuth();
    return await userRepository.getStats();
  } catch (error) {
    console.error("Failed to fetch user stats:", error);
    return {
      total: 0,
      verified: 0,
      unverified: 0,
    };
  }
}
