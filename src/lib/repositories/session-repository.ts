import { db } from "@/lib/db";
import { session, user } from "@/db/schema";
import { desc, eq, gt, count, and, lt } from "drizzle-orm";
import { PaginatedResult } from "./base-repository";
import { WebhookAwareRepository } from "./webhook-aware-repository";

export interface SessionEntity {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
}

export interface SessionWithToken extends SessionEntity {
  token: string;
}

export interface SessionStats {
  total: number;
  active: number;
  expired: number;
}

export interface GetSessionsFilter {
  activeOnly?: boolean;
  search?: string;
}

/**
 * Session Repository
 * Handles all database operations related to sessions
 * Automatically emits webhook events for session operations
 */
export class SessionRepository extends WebhookAwareRepository {
  constructor() {
    super({
      entityName: "session",
      eventMapping: {
        created: "session.created",
        deleted: "session.deleted",
      },
      getUserId: (data: unknown) => (data as SessionEntity).userId,
    });
  }

  /**
   * Find session by ID
   */
  async findById(sessionId: string): Promise<SessionEntity | null> {
    try {
      const [result] = await db
        .select({
          id: session.id,
          userId: session.userId,
          userEmail: user.email,
          userName: user.name,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          updatedAt: session.updatedAt,
        })
        .from(session)
        .innerJoin(user, eq(session.userId, user.id))
        .where(eq(session.id, sessionId))
        .limit(1);

      return result || null;
    } catch (error) {
      console.error("SessionRepository.findById error:", error);
      return null;
    }
  }

  /**
   * Get paginated list of sessions with filtering
   */
  async findMany(
    page: number,
    pageSize: number,
    filter?: GetSessionsFilter
  ): Promise<PaginatedResult<SessionEntity>> {
    try {
      const offset = (page - 1) * pageSize;
      const now = new Date();

      // Build where conditions
      const conditions = [];

      if (filter?.activeOnly) {
        conditions.push(gt(session.expiresAt, now));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const [totalResult] = await db
        .select({ value: count() })
        .from(session)
        .innerJoin(user, eq(session.userId, user.id))
        .where(whereClause);

      const total = totalResult?.value || 0;

      // Get sessions
      let sessions = await db
        .select({
          id: session.id,
          userId: session.userId,
          userEmail: user.email,
          userName: user.name,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          updatedAt: session.updatedAt,
        })
        .from(session)
        .innerJoin(user, eq(session.userId, user.id))
        .where(whereClause)
        .orderBy(desc(session.createdAt))
        .limit(pageSize)
        .offset(offset);

      // Apply text search filter if provided
      if (filter?.search) {
        const searchLower = filter.search.toLowerCase();
        sessions = sessions.filter(
          (s) =>
            s.userEmail?.toLowerCase().includes(searchLower) ||
            s.userName?.toLowerCase().includes(searchLower) ||
            s.ipAddress?.toLowerCase().includes(searchLower)
        );
      }

      const totalPages = Math.ceil(total / pageSize);

      return {
        items: sessions,
        total,
        page,
        pageSize,
        totalPages,
      };
    } catch (error) {
      console.error("SessionRepository.findMany error:", error);
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
   * Get recent sessions (most recent first)
   */
  async findRecent(limit = 10): Promise<SessionEntity[]> {
    try {
      const sessions = await db
        .select({
          id: session.id,
          userId: session.userId,
          userEmail: user.email,
          userName: user.name,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          updatedAt: session.updatedAt,
        })
        .from(session)
        .innerJoin(user, eq(session.userId, user.id))
        .orderBy(desc(session.createdAt))
        .limit(limit);

      return sessions;
    } catch (error) {
      console.error("SessionRepository.findRecent error:", error);
      return [];
    }
  }

  /**
   * Get sessions for a specific user
   */
  async findByUserId(userId: string): Promise<SessionEntity[]> {
    try {
      const sessions = await db
        .select({
          id: session.id,
          userId: session.userId,
          userEmail: user.email,
          userName: user.name,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          updatedAt: session.updatedAt,
        })
        .from(session)
        .innerJoin(user, eq(session.userId, user.id))
        .where(eq(session.userId, userId))
        .orderBy(desc(session.createdAt));

      return sessions;
    } catch (error) {
      console.error("SessionRepository.findByUserId error:", error);
      return [];
    }
  }

  /**
   * Get sessions for a specific user (with token for revocation)
   */
  async findByUserIdWithToken(userId: string): Promise<SessionWithToken[]> {
    try {
      const sessions = await db
        .select({
          id: session.id,
          userId: session.userId,
          userEmail: user.email,
          userName: user.name,
          token: session.token,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          updatedAt: session.updatedAt,
        })
        .from(session)
        .innerJoin(user, eq(session.userId, user.id))
        .where(eq(session.userId, userId))
        .orderBy(desc(session.createdAt));

      return sessions;
    } catch (error) {
      console.error("SessionRepository.findByUserIdWithToken error:", error);
      return [];
    }
  }

  /**
   * Count active sessions
   */
  async countActive(): Promise<number> {
    try {
      const now = new Date();
      const [result] = await db
        .select({ value: count() })
        .from(session)
        .where(gt(session.expiresAt, now));

      return result?.value || 0;
    } catch (error) {
      console.error("SessionRepository.countActive error:", error);
      return 0;
    }
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<SessionStats> {
    try {
      const now = new Date();
      
      const [totalResult, activeResult] = await Promise.all([
        db.select({ value: count() }).from(session),
        db.select({ value: count() }).from(session).where(gt(session.expiresAt, now)),
      ]);

      const total = totalResult[0]?.value || 0;
      const active = activeResult[0]?.value || 0;

      return {
        total,
        active,
        expired: total - active,
      };
    } catch (error) {
      console.error("SessionRepository.getStats error:", error);
      return {
        total: 0,
        active: 0,
        expired: 0,
      };
    }
  }

  /**
   * Delete session
   * Automatically emits session.deleted webhook event
   */
  async delete(sessionId: string, options: { silent?: boolean } = {}): Promise<boolean> {
    const sessionData = await this.findById(sessionId);
    if (!sessionData) return false;

    return this.deleteWithWebhook(sessionData, async () => {
      try {
        await db.delete(session).where(eq(session.id, sessionId));
        return true;
      } catch (error) {
        console.error("SessionRepository.delete error:", error);
        return false;
      }
    }, options);
  }

  /**
   * Delete all sessions for a user
   */
  async deleteByUserId(userId: string): Promise<boolean> {
    try {
      await db.delete(session).where(eq(session.userId, userId));
      return true;
    } catch (error) {
      console.error("SessionRepository.deleteByUserId error:", error);
      return false;
    }
  }

  /**
   * Delete all expired sessions
   */
  async deleteExpired(): Promise<number> {
    try {
      const now = new Date();
      const result = await db.delete(session).where(lt(session.expiresAt, now));
      return result.rowsAffected || 0;
    } catch (error) {
      console.error("SessionRepository.deleteExpired error:", error);
      return 0;
    }
  }
}
