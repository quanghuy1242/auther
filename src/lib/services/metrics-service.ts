import { metricsRepository } from "@/lib/repositories";
import type { CreateMetricData } from "@/db/schema";

// Constants for user metric enforcement
const MAX_TAG_KEYS = 10;
const MAX_TAG_VALUE_LENGTH = 128;
const USER_METRIC_PREFIX = "user.";

export interface MetricsService {
    count(name: string, value?: number, tags?: Record<string, string>): Promise<void>;
    gauge(name: string, value: number, tags?: Record<string, string>): Promise<void>;
    histogram(name: string, value: number, tags?: Record<string, string>): Promise<void>;
    measure<T>(
        name: string,
        fn: () => Promise<T>,
        tags?: Record<string, string>
    ): Promise<T>;
    recordUserMetric(
        name: string,
        value: number,
        type: "count" | "gauge",
        tags?: Record<string, string>
    ): Promise<void>;
}

/**
 * Sanitize tags to remove PII and enforce limits
 */
function sanitizeTags(
    tags?: Record<string, string>
): Record<string, string> | undefined {
    if (!tags) return undefined;

    const sanitized: Record<string, string> = {};
    const blockedKeys = ["user_id", "email", "ip", "user_agent", "authorization"];
    let count = 0;

    for (const [key, value] of Object.entries(tags)) {
        if (count >= MAX_TAG_KEYS) break;
        if (blockedKeys.includes(key.toLowerCase())) continue;

        sanitized[key] = String(value).slice(0, MAX_TAG_VALUE_LENGTH);
        count++;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * MetricsService Implementation
 * High-level abstraction for recording metrics
 */
class MetricsServiceImpl implements MetricsService {
    /**
     * Record a counter metric (incremented value)
     */
    async count(
        name: string,
        value: number = 1,
        tags?: Record<string, string>
    ): Promise<void> {
        await metricsRepository.create({
            name,
            value,
            tags: sanitizeTags(tags),
            metricType: "system",
            timestamp: new Date(),
        });
    }

    /**
     * Record a gauge metric (point-in-time value)
     */
    async gauge(
        name: string,
        value: number,
        tags?: Record<string, string>
    ): Promise<void> {
        await metricsRepository.create({
            name,
            value,
            tags: sanitizeTags(tags),
            metricType: "system",
            timestamp: new Date(),
        });
    }

    /**
     * Record a histogram metric (distribution value like latency)
     */
    async histogram(
        name: string,
        value: number,
        tags?: Record<string, string>
    ): Promise<void> {
        await metricsRepository.create({
            name,
            value,
            tags: sanitizeTags(tags),
            metricType: "system",
            timestamp: new Date(),
        });
    }

    /**
     * Measure the duration of an async function and record it
     */
    async measure<T>(
        name: string,
        fn: () => Promise<T>,
        tags?: Record<string, string>
    ): Promise<T> {
        const start = performance.now();
        try {
            const result = await fn();
            const duration = performance.now() - start;
            await this.histogram(name, duration, { ...tags, result: "success" });
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            await this.histogram(name, duration, { ...tags, result: "error" });
            throw error;
        }
    }

    /**
     * Record a user-defined metric from Lua scripts
     * Enforces prefixing and tag limits
     */
    async recordUserMetric(
        name: string,
        value: number,
        type: "count" | "gauge",
        tags?: Record<string, string>
    ): Promise<void> {
        // Enforce user. prefix
        const prefixedName = name.startsWith(USER_METRIC_PREFIX)
            ? name
            : `${USER_METRIC_PREFIX}${name}`;

        const data: Omit<CreateMetricData, "id" | "createdAt"> = {
            name: prefixedName,
            value,
            tags: sanitizeTags(tags),
            metricType: "user",
            timestamp: new Date(),
        };

        await metricsRepository.create(data);
    }
}

// Export singleton instance
export const metricsService = new MetricsServiceImpl();
