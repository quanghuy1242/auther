import { db } from "@/lib/db";
import { metrics, type MetricEntity, type CreateMetricData } from "@/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

export interface FindMetricsOptions {
    name: string;
    from: Date;
    to: Date;
    metricType?: "system" | "user";
    limit?: number;
}

export interface AggregateResult {
    value: number;
    bucket: Date;
}

/**
 * Metrics Repository
 * Handles all database operations for metrics storage and retrieval
 */
export class MetricsRepository {
    /**
     * Create a single metric
     */
    async create(data: Omit<CreateMetricData, "id" | "createdAt">): Promise<MetricEntity> {
        const id = crypto.randomUUID();
        const [metric] = await db
            .insert(metrics)
            .values({
                ...data,
                id,
            })
            .returning();

        return metric;
    }

    /**
     * Create multiple metrics in a batch (for pipeline/bulk operations)
     */
    async createBatch(items: Omit<CreateMetricData, "id" | "createdAt">[]): Promise<void> {
        if (items.length === 0) return;

        const withIds = items.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
        }));

        await db.insert(metrics).values(withIds);
    }

    /**
     * Find metrics by name within a time range
     */
    async findMetrics(options: FindMetricsOptions): Promise<MetricEntity[]> {
        const conditions = [
            eq(metrics.name, options.name),
            gte(metrics.timestamp, options.from),
            lte(metrics.timestamp, options.to),
        ];

        if (options.metricType) {
            conditions.push(eq(metrics.metricType, options.metricType));
        }

        return db
            .select()
            .from(metrics)
            .where(and(...conditions))
            .orderBy(desc(metrics.timestamp))
            .limit(options.limit ?? 1000);
    }

    /**
     * Aggregate metrics (avg, max, sum) grouped by time bucket
     */
    async aggregate(
        name: string,
        type: "avg" | "max" | "sum",
        from: Date,
        to: Date,
        intervalSeconds: number = 3600 // default 1 hour
    ): Promise<AggregateResult[]> {
        const aggFn =
            type === "avg"
                ? sql<number>`avg(${metrics.value})`
                : type === "max"
                    ? sql<number>`max(${metrics.value})`
                    : sql<number>`sum(${metrics.value})`;

        // SQLite strftime-based bucketing
        const bucket = sql<number>`floor(${metrics.timestamp} / ${intervalSeconds * 1000}) * ${intervalSeconds * 1000}`;

        const results = await db
            .select({
                value: aggFn,
                bucket,
            })
            .from(metrics)
            .where(
                and(
                    eq(metrics.name, name),
                    gte(metrics.timestamp, from),
                    lte(metrics.timestamp, to)
                )
            )
            .groupBy(bucket)
            .orderBy(bucket);

        return results.map((r) => ({
            value: r.value ?? 0,
            bucket: new Date(r.bucket),
        }));
    }

    /**
     * Delete old metrics for retention cleanup
     */
    async deleteOlderThan(cutoff: Date): Promise<number> {
        const result = await db
            .delete(metrics)
            .where(lte(metrics.createdAt, cutoff));

        return result.rowsAffected ?? 0;
    }

    /**
     * Get time-series data for dashboard charts with optional tag filtering
     * Returns data points bucketed by interval
     */
    async getTimeSeries(
        name: string,
        from: Date,
        to: Date,
        intervalSeconds: number,
        tags?: Record<string, string>
    ): Promise<{ timestamp: number; value: number }[]> {
        const bucket = sql<number>`floor(${metrics.timestamp} / ${intervalSeconds * 1000}) * ${intervalSeconds * 1000}`;

        const conditions = [
            eq(metrics.name, name),
            gte(metrics.timestamp, from),
            lte(metrics.timestamp, to),
        ];

        // Add tag filters using json_extract for SQLite
        if (tags) {
            for (const [key, value] of Object.entries(tags)) {
                conditions.push(
                    sql`json_extract(${metrics.tags}, ${`$.${key}`}) = ${value}`
                );
            }
        }

        const results = await db
            .select({
                bucket,
                value: sql<number>`sum(${metrics.value})`,
            })
            .from(metrics)
            .where(and(...conditions))
            .groupBy(bucket)
            .orderBy(bucket);

        return results.map((r) => ({
            timestamp: r.bucket,
            value: r.value ?? 0,
        }));
    }

    /**
     * Get aggregate statistics for a metric (sum, avg, count, p50, p95)
     */
    async getAggregateStats(
        name: string,
        from: Date,
        to: Date,
        tags?: Record<string, string>
    ): Promise<{ sum: number; avg: number; count: number; min: number; max: number }> {
        const conditions = [
            eq(metrics.name, name),
            gte(metrics.timestamp, from),
            lte(metrics.timestamp, to),
        ];

        if (tags) {
            for (const [key, value] of Object.entries(tags)) {
                conditions.push(
                    sql`json_extract(${metrics.tags}, ${`$.${key}`}) = ${value}`
                );
            }
        }

        const [result] = await db
            .select({
                sum: sql<number>`COALESCE(sum(${metrics.value}), 0)`,
                avg: sql<number>`COALESCE(avg(${metrics.value}), 0)`,
                count: sql<number>`count(*)`,
                min: sql<number>`COALESCE(min(${metrics.value}), 0)`,
                max: sql<number>`COALESCE(max(${metrics.value}), 0)`,
            })
            .from(metrics)
            .where(and(...conditions));

        return {
            sum: result?.sum ?? 0,
            avg: result?.avg ?? 0,
            count: result?.count ?? 0,
            min: result?.min ?? 0,
            max: result?.max ?? 0,
        };
    }

    /**
     * Get breakdown of metric counts grouped by a tag value
     */
    async getBreakdown(
        name: string,
        from: Date,
        to: Date,
        groupByTag: string
    ): Promise<Record<string, number>> {
        const tagValue = sql<string>`json_extract(${metrics.tags}, ${`$.${groupByTag}`})`;

        const results = await db
            .select({
                tagValue,
                count: sql<number>`sum(${metrics.value})`,
            })
            .from(metrics)
            .where(
                and(
                    eq(metrics.name, name),
                    gte(metrics.timestamp, from),
                    lte(metrics.timestamp, to)
                )
            )
            .groupBy(tagValue);

        const breakdown: Record<string, number> = {};
        for (const r of results) {
            if (r.tagValue) {
                breakdown[r.tagValue] = r.count ?? 0;
            }
        }
        return breakdown;
    }

    /**
     * Get the latest gauge value for a metric
     */
    async getLatestGauge(name: string): Promise<number | null> {
        const [result] = await db
            .select({ value: metrics.value })
            .from(metrics)
            .where(eq(metrics.name, name))
            .orderBy(desc(metrics.timestamp))
            .limit(1);

        return result?.value ?? null;
    }

    /**
     * Get distinct user-defined metric names
     */
    async getUserMetricNames(): Promise<string[]> {
        const results = await db
            .selectDistinct({ name: metrics.name })
            .from(metrics)
            .where(eq(metrics.metricType, "user"))
            .limit(100);

        return results.map((r) => r.name);
    }
}
