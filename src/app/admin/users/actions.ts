"use server";

import { requireAdmin } from "@/lib/session";
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
    await requireAdmin();

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
    await requireAdmin();
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

export interface UserPickerItem {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

/**
 * Get all users for picker components (simplified, no pagination)
 * Useful for dropdowns, search selectors, etc.
 */
export async function getAllUsers(searchQuery?: string): Promise<UserPickerItem[]> {
  try {
    await requireAdmin();

    // Use the existing getUsers function with high page size
    const result = await getUsers({
      page: 1,
      pageSize: 100, // Reasonable limit for picker
      search: searchQuery,
    });

    // Transform to simpler picker format
    return result.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    }));
  } catch (error) {
    console.error("Failed to fetch users for picker:", error);
    return [];
  }
}
