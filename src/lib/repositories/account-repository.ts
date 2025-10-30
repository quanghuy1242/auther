import { db } from "@/lib/db";
import { account } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export interface AccountEntity {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  createdAt: Date;
}

/**
 * Account Repository
 * Handles all database operations related to OAuth accounts
 */
export class AccountRepository {
  /**
   * Find account by ID
   */
  async findById(accountId: string): Promise<AccountEntity | null> {
    try {
      const [result] = await db
        .select()
        .from(account)
        .where(eq(account.id, accountId))
        .limit(1);

      return result || null;
    } catch (error) {
      console.error("AccountRepository.findById error:", error);
      return null;
    }
  }

  /**
   * Find all accounts for a user
   */
  async findByUserId(userId: string): Promise<AccountEntity[]> {
    try {
      const accounts = await db
        .select()
        .from(account)
        .where(eq(account.userId, userId))
        .orderBy(desc(account.createdAt));

      return accounts;
    } catch (error) {
      console.error("AccountRepository.findByUserId error:", error);
      return [];
    }
  }

  /**
   * Delete account by ID
   */
  async delete(accountId: string): Promise<boolean> {
    try {
      await db.delete(account).where(eq(account.id, accountId));
      return true;
    } catch (error) {
      console.error("AccountRepository.delete error:", error);
      return false;
    }
  }
}
