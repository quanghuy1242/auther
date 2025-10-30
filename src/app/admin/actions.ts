"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, gt, count, and, lt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { session, user } from "@/db/schema";
import { getUserStats } from "@/app/admin/users/actions";
import { getClientStats } from "@/app/admin/clients/actions";
import { getJwksKeys } from "@/app/admin/keys/actions";
import { JWKS_ROTATION_INTERVAL_MS } from "@/lib/constants";

/**
 * Sign out the current user
 * This server action properly handles session termination
 */
export async function signOut() {
  await auth.api.signOut({
    headers: await headers(),
  });
  
  redirect("/sign-in");
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  try {
    const [userStats, clientStats, activeSessionsResult, keys] = await Promise.all([
      getUserStats(),
      getClientStats(),
      db.select({ value: count() })
        .from(session)
        .where(gt(session.expiresAt, new Date())),
      getJwksKeys(),
    ]);

    // Get active sessions count
    const activeSessions = activeSessionsResult[0]?.value || 0;

    // Get latest JWKS key info
    const latestKey = keys[0];
    const keyAge = latestKey ? Date.now() - latestKey.createdAt.getTime() : 0;
    const keyAgeDays = Math.floor(keyAge / (1000 * 60 * 60 * 24));
    const keyAgeHours = Math.floor((keyAge % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const isKeyHealthy = keyAge < JWKS_ROTATION_INTERVAL_MS;

    return {
      users: userStats,
      clients: clientStats,
      activeSessions,
      jwks: {
        total: keys.length,
        latestKeyAge: keyAgeDays > 0 ? `${keyAgeDays}d ${keyAgeHours}h` : `${keyAgeHours}h`,
        isHealthy: isKeyHealthy,
        daysOld: keyAgeDays,
      },
    };
  } catch (error) {
    console.error("Failed to fetch dashboard stats:", error);
    return {
      users: { total: 0, verified: 0, unverified: 0 },
      clients: { total: 0, trusted: 0, dynamic: 0, disabled: 0 },
      activeSessions: 0,
      jwks: {
        total: 0,
        latestKeyAge: "Unknown",
        isHealthy: true,
        daysOld: 0,
      },
    };
  }
}

/**
 * Get recent sign-ins (successful logins)
 */
export async function getRecentSignIns(limit = 10) {
  try {
    const recentSessions = await db
      .select({
        id: session.id,
        userId: session.userId,
        userEmail: user.email,
        userName: user.name,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
      })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .orderBy(desc(session.createdAt))
      .limit(limit);

    return recentSessions;
  } catch (error) {
    console.error("Failed to fetch recent sign-ins:", error);
    return [];
  }
}

/**
 * Get all sessions with filtering and pagination
 */
export async function getSessions({
  page = 1,
  pageSize = 20,
  search = "",
  activeOnly = false,
}: {
  page?: number;
  pageSize?: number;
  search?: string;
  activeOnly?: boolean;
} = {}) {
  try {
    const offset = (page - 1) * pageSize;
    const now = new Date();

    // Build where conditions
    const conditions = [];
    
    if (activeOnly) {
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
    if (search) {
      const searchLower = search.toLowerCase();
      sessions = sessions.filter(
        (s) =>
          s.userEmail?.toLowerCase().includes(searchLower) ||
          s.userName?.toLowerCase().includes(searchLower) ||
          s.ipAddress?.toLowerCase().includes(searchLower)
      );
    }

    const totalPages = Math.ceil(total / pageSize);

    return {
      sessions,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return {
      sessions: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    };
  }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string) {
  try {
    await db.delete(session).where(eq(session.id, sessionId));
    
    return { success: true };
  } catch (error) {
    console.error("Failed to revoke session:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke session",
    };
  }
}

/**
 * Revoke all expired sessions
 */
export async function revokeExpiredSessions() {
  try {
    const now = new Date();
    const result = await db
      .delete(session)
      .where(lt(session.expiresAt, now));
    
    return { success: true, count: result.rowsAffected };
  } catch (error) {
    console.error("Failed to revoke expired sessions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke expired sessions",
    };
  }
}

