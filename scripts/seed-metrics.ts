#!/usr/bin/env tsx
/**
 * Seed Metrics Data for Dashboard Visualization
 * 
 * Creates sample metrics data across all dashboard panel categories:
 * - Authentication Activity (Panel A)
 * - Authorization Health (Panel B)
 * - Pipeline Executions (Panel C)
 * - Webhook Reliability (Panel D)
 * - OIDC & OAuth Health (Panel E)
 * - API Key Usage (Panel F)
 * - Email Delivery (Panel G)
 * - JWKS Health (Panel H)
 * - Admin Activity (Panel I)
 * - User-Defined Metrics (Panel J)
 * 
 * Run: pnpm tsx scripts/seed-metrics.ts
 */

import { createClient } from "@libsql/client";
import { randomUUID } from "crypto";

// Metric periods for realistic data distribution
const HOURS_24 = 24;
const DAYS_7 = 7 * 24;
const DAYS_30 = 30 * 24;

interface MetricData {
    id: string;
    name: string;
    value: number;
    tags: Record<string, string> | null;
    metricType: "system" | "user";
    timestamp: number;
    createdAt: number;
}

function randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function hoursAgo(hours: number): number {
    return Date.now() - hours * 60 * 60 * 1000;
}

function generateMetric(
    name: string,
    value: number,
    tags: Record<string, string> | null,
    timestampMs: number,
    metricType: "system" | "user" = "system"
): MetricData {
    return {
        id: randomUUID(),
        name,
        value,
        tags,
        metricType,
        timestamp: timestampMs,
        createdAt: timestampMs,
    };
}

async function seedMetrics() {
    console.log("🌱 Starting metrics seed...\n");

    const client = createClient({
        url: process.env.BETTER_AUTH_DATABASE_URL || "http://libsql:8080",
    });

    const metrics: MetricData[] = [];
    const now = Date.now();

    // -------------------------------------------------------------------------
    // Panel A: Authentication Activity
    // -------------------------------------------------------------------------
    console.log("📊 Generating Authentication Activity metrics...");
    for (let h = 0; h < HOURS_24; h++) {
        const ts = hoursAgo(h);
        // Successful logins (60-120 per hour during day, 10-30 at night)
        const isDay = h >= 6 && h <= 22;
        const successCount = isDay ? randomBetween(60, 120) : randomBetween(10, 30);
        const failCount = Math.floor(successCount * randomFloat(0.05, 0.15));
        const registerCount = randomBetween(2, 15);

        metrics.push(generateMetric("auth.login.attempt", successCount, { status: "success" }, ts));
        metrics.push(generateMetric("auth.login.attempt", failCount, { status: "fail" }, ts));
        metrics.push(generateMetric("auth.register.success", registerCount, null, ts));
        metrics.push(generateMetric("auth.session.created.count", successCount, null, ts));
    }

    // -------------------------------------------------------------------------
    // Panel B: Authorization Health  
    // -------------------------------------------------------------------------
    console.log("📊 Generating Authorization Health metrics...");
    for (let h = 0; h < HOURS_24; h++) {
        const ts = hoursAgo(h);
        const allowed = randomBetween(200, 500);
        const denied = randomBetween(10, 40);
        const errors = randomBetween(0, 5);

        metrics.push(generateMetric("authz.decision.count", allowed, { result: "allowed" }, ts));
        metrics.push(generateMetric("authz.decision.count", denied, { result: "denied" }, ts));
        metrics.push(generateMetric("authz.error.count", errors, null, ts));
    }

    // -------------------------------------------------------------------------
    // Panel C: Pipeline Executions
    // -------------------------------------------------------------------------
    console.log("📊 Generating Pipeline metrics...");
    for (let h = 0; h < HOURS_24; h++) {
        const ts = hoursAgo(h);
        // Latency in ms (P95 between 50-200ms)
        const duration = randomFloat(30, 180);
        metrics.push(generateMetric("pipeline.exec.duration", duration, null, ts));
    }
    // Gauges for Lua pool
    metrics.push(generateMetric("lua.pool.active", randomBetween(2, 8), null, now));
    metrics.push(generateMetric("lua.pool.waiting", randomBetween(0, 3), null, now));
    metrics.push(generateMetric("lua.pool.exhausted", randomBetween(0, 2), null, hoursAgo(1)));

    // -------------------------------------------------------------------------
    // Panel D: Webhook Reliability
    // -------------------------------------------------------------------------
    console.log("📊 Generating Webhook metrics...");
    for (let h = 0; h < HOURS_24; h++) {
        const ts = hoursAgo(h);
        const emitCount = randomBetween(20, 80);
        const errorCount = Math.floor(emitCount * randomFloat(0.01, 0.05));
        const emitDuration = randomFloat(10, 50);
        const deliveryDuration = randomFloat(100, 500);

        metrics.push(generateMetric("webhook.emit.count", emitCount, null, ts));
        metrics.push(generateMetric("qstash.publish.error.count", errorCount, null, ts));
        metrics.push(generateMetric("webhook.emit.duration_ms", emitDuration, null, ts));
        metrics.push(generateMetric("webhook.delivery.duration_ms", deliveryDuration, null, ts));
    }

    // -------------------------------------------------------------------------
    // Panel E: OIDC & OAuth Health
    // -------------------------------------------------------------------------
    console.log("📊 Generating OIDC/OAuth metrics...");
    for (let h = 0; h < HOURS_24; h++) {
        const ts = hoursAgo(h);
        metrics.push(generateMetric("oidc.authorize.request.count", randomBetween(50, 150), null, ts));
        metrics.push(generateMetric("oidc.token.request.count", randomBetween(40, 120), null, ts));
        metrics.push(generateMetric("oidc.userinfo.request.count", randomBetween(20, 60), null, ts));
        metrics.push(generateMetric("oidc.jwks.request.count", randomBetween(100, 300), null, ts));

        // Errors (occasional)
        if (h % 4 === 0) {
            metrics.push(generateMetric("oidc.authorize.access_denied.count", randomBetween(1, 5), null, ts));
            metrics.push(generateMetric("oauth.redirect_uri.invalid.count", randomBetween(0, 3), null, ts));
            metrics.push(generateMetric("oauth.pkce.failure.count", randomBetween(0, 2), null, ts));
        }
    }

    // -------------------------------------------------------------------------
    // Panel F: API Key Usage
    // -------------------------------------------------------------------------
    console.log("📊 Generating API Key metrics...");
    for (let h = 0; h < HOURS_24; h++) {
        const ts = hoursAgo(h);
        metrics.push(generateMetric("apikey.issued.count", randomBetween(1, 5), null, ts));
        metrics.push(generateMetric("apikey.revoked.count", randomBetween(0, 2), null, ts));
        metrics.push(generateMetric("apikey.resolve.duration", randomFloat(5, 25), null, ts));
        metrics.push(generateMetric("apikey.groups.count", randomFloat(1, 4), null, ts));

        if (h % 6 === 0) {
            metrics.push(generateMetric("apikey.auth.missing.count", randomBetween(0, 3), null, ts));
            metrics.push(generateMetric("apikey.auth.invalid.count", randomBetween(0, 2), null, ts));
        }
    }

    // -------------------------------------------------------------------------
    // Panel G: Email Delivery
    // -------------------------------------------------------------------------
    console.log("📊 Generating Email metrics...");
    for (let h = 0; h < HOURS_24; h++) {
        const ts = hoursAgo(h);
        const successCount = randomBetween(5, 30);
        const errorCount = randomBetween(0, 2);
        const rateLimited = randomBetween(0, 1);

        metrics.push(generateMetric("email.send.success", successCount, null, ts));
        metrics.push(generateMetric("email.send.error", errorCount, null, ts));
        metrics.push(generateMetric("email.send.rate_limited.count", rateLimited, null, ts));
        metrics.push(generateMetric("email.send.duration_ms", randomFloat(200, 800), null, ts));
    }

    // -------------------------------------------------------------------------
    // Panel H: JWKS Health
    // -------------------------------------------------------------------------
    console.log("📊 Generating JWKS Health metrics...");
    // Key age gauge (12 days old)
    const keyAgeMs = 12 * 24 * 60 * 60 * 1000;
    metrics.push(generateMetric("jwks.active_key.age_ms", keyAgeMs, null, now));
    metrics.push(generateMetric("jwks.rotate.duration_ms", randomFloat(50, 150), null, hoursAgo(12 * 24)));
    metrics.push(generateMetric("jwks.pruned.count", randomBetween(1, 3), null, hoursAgo(12 * 24)));

    // -------------------------------------------------------------------------
    // Panel J: User-Defined Metrics
    // -------------------------------------------------------------------------
    console.log("📊 Generating User-Defined metrics...");
    const userMetricNames = ["custom.api_calls", "custom.conversion_rate", "custom.revenue_events"];
    for (const metricName of userMetricNames) {
        for (let h = 0; h < HOURS_24; h++) {
            const ts = hoursAgo(h);
            metrics.push(generateMetric(metricName, randomFloat(10, 100), null, ts, "user"));
        }
    }

    // -------------------------------------------------------------------------
    // Insert all metrics
    // -------------------------------------------------------------------------
    console.log(`\n📥 Inserting ${metrics.length} metrics into database...`);

    try {
        // Batch insert (SQLite supports multi-row INSERT)
        const batchSize = 100;
        let inserted = 0;

        for (let i = 0; i < metrics.length; i += batchSize) {
            const batch = metrics.slice(i, i + batchSize);
            const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
            const values = batch.flatMap((m) => [
                m.id,
                m.name,
                m.value,
                m.tags ? JSON.stringify(m.tags) : null,
                m.metricType,
                m.timestamp,
                m.createdAt,
            ]);

            await client.execute({
                sql: `INSERT INTO metrics (id, name, value, tags, metric_type, timestamp, created_at) VALUES ${placeholders}`,
                args: values,
            });

            inserted += batch.length;
            process.stdout.write(`\r   Inserted: ${inserted}/${metrics.length}`);
        }

        console.log("\n");
        console.log("✅ Metrics seed complete!");
        console.log(`   Total metrics: ${metrics.length}`);
        console.log("   Categories seeded:");
        console.log("   - Authentication Activity (Panel A)");
        console.log("   - Authorization Health (Panel B)");
        console.log("   - Pipeline Executions (Panel C)");
        console.log("   - Webhook Reliability (Panel D)");
        console.log("   - OIDC & OAuth Health (Panel E)");
        console.log("   - API Key Usage (Panel F)");
        console.log("   - Email Delivery (Panel G)");
        console.log("   - JWKS Health (Panel H)");
        console.log("   - User-Defined Metrics (Panel J)");

    } catch (error) {
        console.error("\n❌ Failed to insert metrics:", error);
        throw error;
    } finally {
        client.close();
    }
}

// Run if executed directly
if (require.main === module) {
    seedMetrics()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ Seed error:", error);
            process.exit(1);
        });
}

export { seedMetrics };
