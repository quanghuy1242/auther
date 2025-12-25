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
        const bucket = sql<number>`(${metrics.timestamp} / ${intervalSeconds * 1000}) * ${intervalSeconds * 1000}`;

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
}
