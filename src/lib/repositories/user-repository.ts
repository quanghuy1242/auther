import { db } from "@/lib/db";
import { user, account } from "@/db/schema";
import { desc, like, or, eq, count, sql } from "drizzle-orm";
import { BaseRepository, PaginatedResult } from "./base-repository";

export interface UserAccount {
  providerId: string;
  accountId: string;
}

export interface UserEntity {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  username: string | null;
  displayUsername: string | null;
  role?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithAccounts extends UserEntity {
  accounts: UserAccount[];
}

export interface UserStats {
  total: number;
  verified: number;
  unverified: number;
}

export interface GetUsersFilter {
  search?: string;
  verified?: boolean | null;
}

/**
 * User Repository
 * Handles all database operations related to users
 */
export class UserRepository implements Partial<BaseRepository<UserEntity>> {
  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<UserEntity | null> {
    try {
      const [result] = await db
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      return result || null;
    } catch (error) {
      console.error("UserRepository.findById error:", error);
      return null;
    }
  }

  /**
   * Find user by ID with accounts
   */
  async findByIdWithAccounts(userId: string): Promise<UserWithAccounts | null> {
    try {
      const userResult = await this.findById(userId);
      if (!userResult) return null;

      const accounts = await db
        .select({
          providerId: account.providerId,
          accountId: account.accountId,
        })
        .from(account)
        .where(eq(account.userId, userId))
        .orderBy(desc(account.createdAt));

      return {
        ...userResult,
        accounts,
      };
    } catch (error) {
      console.error("UserRepository.findByIdWithAccounts error:", error);
      return null;
    }
  }

  /**
   * Get paginated list of users with accounts
   */
  async findManyWithAccounts(
    page: number,
    pageSize: number,
    filter?: GetUsersFilter
  ): Promise<PaginatedResult<UserWithAccounts>> {
    try {
      const offset = (page - 1) * pageSize;

      // Build where conditions
      let whereCondition = undefined;

      if (filter?.search) {
        const searchCondition = or(
          like(user.email, `%${filter.search}%`),
          like(user.name, `%${filter.search}%`),
          filter.search ? like(user.username, `%${filter.search}%`) : undefined
        );
        whereCondition = searchCondition;
      }

      if (filter?.verified !== null && filter?.verified !== undefined) {
        const verifiedCondition = eq(user.emailVerified, filter.verified);
        whereCondition = whereCondition
          ? sql`${whereCondition} AND ${verifiedCondition}`
          : verifiedCondition;
      }

      // Get total count
      const countResult = await db
        .select({ value: count() })
        .from(user)
        .where(whereCondition);

      const total = countResult[0]?.value || 0;

      // Get users
      const users = await db
        .select()
        .from(user)
        .where(whereCondition)
        .orderBy(desc(user.createdAt))
        .limit(pageSize)
        .offset(offset);

      // Get accounts for these users
      const userIds = users.map((u) => u.id);
      const accounts =
        userIds.length > 0
          ? await db
              .select({
                userId: account.userId,
                providerId: account.providerId,
                accountId: account.accountId,
              })
              .from(account)
              .where(
                sql`${account.userId} IN (${sql.join(
                  userIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
          : [];

      // Combine data
      const usersWithAccounts: UserWithAccounts[] = users.map((u) => ({
        ...u,
        accounts: accounts
          .filter((acc) => acc.userId === u.id)
          .map((acc) => ({
            providerId: acc.providerId,
            accountId: acc.accountId,
          })),
      }));

      return {
        items: usersWithAccounts,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      console.error("UserRepository.findManyWithAccounts error:", error);
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
   * Get user statistics
   */
  async getStats(): Promise<UserStats> {
    try {
      const totalResult = await db.select({ value: count() }).from(user);

      const verifiedResult = await db
        .select({ value: count() })
        .from(user)
        .where(eq(user.emailVerified, true));

      const total = totalResult[0]?.value || 0;
      const verified = verifiedResult[0]?.value || 0;

      return {
        total,
        verified,
        unverified: total - verified,
      };
    } catch (error) {
      console.error("UserRepository.getStats error:", error);
      return {
        total: 0,
        verified: 0,
        unverified: 0,
      };
    }
  }

  /**
   * Update user
   */
  async update(
    userId: string,
    data: {
      name?: string;
      username?: string | null;
      displayUsername?: string | null;
      emailVerified?: boolean;
    }
  ): Promise<UserEntity | null> {
    try {
      await db
        .update(user)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));

      return await this.findById(userId);
    } catch (error) {
      console.error("UserRepository.update error:", error);
      return null;
    }
  }
}
