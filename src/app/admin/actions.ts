"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sessionRepository } from "@/lib/repositories";
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
    const [userStats, clientStats, activeSessions, keys] = await Promise.all([
      getUserStats(),
      getClientStats(),
      sessionRepository.countActive(),
      getJwksKeys(),
    ]);

    // Get latest JWKS key info
    const latestKey = keys[0];
    const keyAge = latestKey ? Date.now() - latestKey.createdAt.getTime() : 0;
    const keyAgeDays = Math.floor(keyAge / (1000 * 60 * 60 * 24));
    const keyAgeHours = Math.floor(
      (keyAge % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const isKeyHealthy = keyAge < JWKS_ROTATION_INTERVAL_MS;

    return {
      users: userStats,
      clients: clientStats,
      activeSessions,
      jwks: {
        total: keys.length,
        latestKeyAge:
          keyAgeDays > 0 ? `${keyAgeDays}d ${keyAgeHours}h` : `${keyAgeHours}h`,
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
    const sessions = await sessionRepository.findRecent(limit);
    return sessions;
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
    const result = await sessionRepository.findMany(page, pageSize, {
      activeOnly,
      search,
    });

    return {
      sessions: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
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
    const success = await sessionRepository.delete(sessionId);

    return { success };
  } catch (error) {
    console.error("Failed to revoke session:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to revoke session",
    };
  }
}

/**
 * Revoke all expired sessions
 */
export async function revokeExpiredSessions() {
  try {
    const count = await sessionRepository.deleteExpired();

    return { success: true, count };
  } catch (error) {
    console.error("Failed to revoke expired sessions:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to revoke expired sessions",
    };
  }
}

