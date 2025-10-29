"use server";

import { db } from "@/lib/db";
import { user as userTable, account as accountTable } from "@/db/schema";
import { desc, like, or, eq, count, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/session";

export interface UserAccount {
  providerId: string;
  accountId: string;
}

export interface UserWithAccounts {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  username: string | null;
  displayUsername: string | null;
  createdAt: Date;
  updatedAt: Date;
  accounts: UserAccount[];
}

export interface GetUsersResult {
  users: UserWithAccounts[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserStats {
  total: number;
  verified: number;
  unverified: number;
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
    const offset = (page - 1) * pageSize;

    // Build where conditions
    let whereCondition = undefined;
    
    if (params.search) {
      const searchCondition = or(
        like(userTable.email, `%${params.search}%`),
        like(userTable.name, `%${params.search}%`),
        params.search ? like(userTable.username, `%${params.search}%`) : undefined
      );
      whereCondition = searchCondition;
    }
    
    if (params.verified !== null && params.verified !== undefined) {
      const verifiedCondition = eq(userTable.emailVerified, params.verified);
      whereCondition = whereCondition 
        ? sql`${whereCondition} AND ${verifiedCondition}`
        : verifiedCondition;
    }

    // Get total count
    const countResult = await db
      .select({ value: count() })
      .from(userTable)
      .where(whereCondition);
    
    const total = countResult[0]?.value || 0;

    // Get users
    const users = await db
      .select()
      .from(userTable)
      .where(whereCondition)
      .orderBy(desc(userTable.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Get accounts for these users
    const userIds = users.map((u) => u.id);
    const accounts =
      userIds.length > 0
        ? await db
            .select({
              userId: accountTable.userId,
              providerId: accountTable.providerId,
              accountId: accountTable.accountId,
            })
            .from(accountTable)
            .where(
              sql`${accountTable.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`
            )
        : [];

    // Combine data
    const usersWithAccounts: UserWithAccounts[] = users.map((user) => ({
      ...user,
      accounts: accounts
        .filter((acc) => acc.userId === user.id)
        .map((acc) => ({
          providerId: acc.providerId,
          accountId: acc.accountId,
        })),
    }));

    return {
      users: usersWithAccounts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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

    const totalResult = await db
      .select({ value: count() })
      .from(userTable);

    const verifiedResult = await db
      .select({ value: count() })
      .from(userTable)
      .where(eq(userTable.emailVerified, true));

    const total = totalResult[0]?.value || 0;
    const verified = verifiedResult[0]?.value || 0;

    return {
      total,
      verified,
      unverified: total - verified,
    };
  } catch (error) {
    console.error("Failed to fetch user stats:", error);
    return {
      total: 0,
      verified: 0,
      unverified: 0,
    };
  }
}
