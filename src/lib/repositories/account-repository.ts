import { db } from "@/lib/db";
import { account } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { WebhookAwareRepository } from "./webhook-aware-repository";

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
 * Automatically emits webhook events for account operations
 */
export class AccountRepository extends WebhookAwareRepository {
  constructor() {
    super({
      entityName: "account",
      eventMapping: {
        created: "account.linked",
        deleted: "account.unlinked",
      },
      getUserId: (data: unknown) => (data as AccountEntity).userId,
    });
  }

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
   * Automatically emits account.unlinked webhook event
   */
  async delete(accountId: string, options: { silent?: boolean } = {}): Promise<boolean> {
    const accountData = await this.findById(accountId);
    if (!accountData) return false;

    return this.deleteWithWebhook(accountData, async () => {
      try {
        await db.delete(account).where(eq(account.id, accountId));
        return true;
      } catch (error) {
        console.error("AccountRepository.delete error:", error);
        return false;
      }
    }, options);
  }
}
