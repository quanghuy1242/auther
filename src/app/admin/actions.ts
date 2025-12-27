"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sessionRepository } from "@/lib/repositories";
import { getUserStats } from "@/app/admin/users/actions";
import { getClientStats } from "@/app/admin/clients/actions";
import { getJwksKeys } from "@/app/admin/keys/actions";
import { JWKS_ROTATION_INTERVAL_MS } from "@/lib/constants";
import { guards } from "@/lib/auth/platform-guard";
import { metricsService } from "@/lib/services";

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
    await guards.platform.member();
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
    await guards.sessions.viewAll();
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
    await guards.sessions.viewAll();
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
    await guards.sessions.revokeAll();
    const success = await sessionRepository.delete(sessionId);

    if (success) {
      // Metric: admin session revocation
      await metricsService.count("admin.session.revoke", 1, { actor_type: "admin", reason: "manual" });
    }

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
    await guards.sessions.revokeAll();
    const count = await sessionRepository.deleteExpired();

    if (count > 0) {
      // Metric: bulk session revocation (expired cleanup)
      await metricsService.count("admin.session.revoke", count, { actor_type: "admin", reason: "expiry" });
    }

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

// ============================================================================
// Dashboard Metrics Actions
// ============================================================================

import { metricsRepository } from "@/lib/repositories";

export type Period = "24h" | "7d" | "30d" | "12mo";

/**
 * Get period configuration (time range and interval)
 */
function getPeriodRange(period: Period): { from: Date; to: Date; intervalSeconds: number } {
  const now = new Date();
  const to = now;
  let from: Date;
  let intervalSeconds: number;

  switch (period) {
    case "24h":
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      intervalSeconds = 3600; // 1 hour buckets
      break;
    case "7d":
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      intervalSeconds = 6 * 3600; // 6 hour buckets
      break;
    case "30d":
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      intervalSeconds = 24 * 3600; // 1 day buckets
      break;
    case "12mo":
      from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      intervalSeconds = 30 * 24 * 3600; // ~1 month buckets
      break;
  }

  return { from, to, intervalSeconds };
}

/**
 * Get time-series data for a metric
 * Returns array of { timestamp, value } for charting
 */
export async function getMetricsTimeSeries(
  name: string,
  period: Period,
  tags?: Record<string, string>
) {
  try {
    await guards.platform.member();
    const { from, to, intervalSeconds } = getPeriodRange(period);

    const data = await metricsRepository.getTimeSeries(
      name,
      from,
      to,
      intervalSeconds,
      tags
    );

    return { success: true, data };
  } catch (error) {
    console.error("Failed to fetch metrics time series:", error);
    return { success: false, data: [], error: String(error) };
  }
}

/**
 * Get aggregate statistics for a metric
 * Returns { sum, avg, count, min, max }
 */
export async function getMetricsAggregate(
  name: string,
  period: Period,
  tags?: Record<string, string>
) {
  try {
    await guards.platform.member();
    const { from, to } = getPeriodRange(period);

    const stats = await metricsRepository.getAggregateStats(name, from, to, tags);

    return { success: true, stats };
  } catch (error) {
    console.error("Failed to fetch metrics aggregate:", error);
    return {
      success: false,
      stats: { sum: 0, avg: 0, count: 0, min: 0, max: 0 },
      error: String(error),
    };
  }
}

/**
 * Get breakdown of metric counts grouped by a tag
 * Returns { [tagValue]: count }
 */
export async function getMetricsBreakdown(
  name: string,
  period: Period,
  groupByTag: string
) {
  try {
    await guards.platform.member();
    const { from, to } = getPeriodRange(period);

    const breakdown = await metricsRepository.getBreakdown(name, from, to, groupByTag);

    return { success: true, breakdown };
  } catch (error) {
    console.error("Failed to fetch metrics breakdown:", error);
    return { success: false, breakdown: {}, error: String(error) };
  }
}

/**
 * Get latest gauge value for a metric
 */
export async function getLatestGauge(name: string) {
  try {
    await guards.platform.member();
    const value = await metricsRepository.getLatestGauge(name);

    return { success: true, value };
  } catch (error) {
    console.error("Failed to fetch latest gauge:", error);
    return { success: false, value: null, error: String(error) };
  }
}

/**
 * Get available user-defined metric names
 * Returns list of metric names with 'user' type
 */
export async function getUserMetricNames() {
  try {
    await guards.platform.member();
    const names = await metricsRepository.getUserMetricNames();

    return { success: true, names };
  } catch (error) {
    console.error("Failed to fetch user metric names:", error);
    return { success: false, names: [], error: String(error) };
  }
}
