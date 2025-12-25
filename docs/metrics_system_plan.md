# Metrics System Implementation Plan

## 1. Objective
Establish a unified, internal metrics collection system to track system health, performance, security events, and business logic execution. This system will serve as the foundation for future observability tools (dashboards, alerting) without relying on external services initially.

**Key Goals:**
*   **System Health:** Monitor API latency, database performance, resource usage (Lua Pool, JWKS), and external integrations (Resend, QStash).
*   **Pipeline Observability:** distinct visibility into "System Overhead" vs "User Script Performance".
*   **Security Observability:** Deep insights into authorization complexity (ReBAC/ABAC), API key usage, key lifecycle, and admin interventions.
*   **User-Defined Metrics:** Allow users to emit custom business metrics (e.g., `invoice.processed_count`) directly from their Lua scripts.

### 1.1. Reality Check (Current Repo State)
This plan should *complement* existing observability data sources already implemented in the codebase:

*   **Pipeline tracing is already implemented** via `pipeline_traces` + `pipeline_spans` in `src/db/pipeline-schema.ts`, including retention cleanup via `src/app/api/internal/cleanup-traces/route.ts`.
*   **ABAC evaluation audit logging is already implemented** via `abac_audit_logs` (including `execution_time_ms`) in `src/db/abac-schema.ts`.
*   The database is **Drizzle + `@libsql/client`** (`src/lib/db.ts`) with `dialect: "sqlite"` targeting **Turso/libSQL**. This plan should refer to "SQLite schema via Drizzle" but assume the operational characteristics of Turso/libSQL (latency, request-based billing, no TTL).

Implication: many "metrics" can be derived from existing trace/audit tables without duplicating writes per request.

## 2. Conceptual Data Model
A "Metric" represents a single data point in time.

| Field | Type | Description |
| :--- | :--- | :--- |
| **Name** | String | Dot-notation identifier (e.g., `http.request.duration`, `auth.login.success`). |
| **Value** | Number | The measured value (latency in ms, count, gauge value). |
| **Tags** | JSON | Key-value pairs for dimensions (e.g., `{ "method": "POST", "status": 200 }`). |
| **Timestamp** | DateTime | When the event occurred. |
| **Source** | String (Optional) | Contextual origin (e.g., `service:api`, `service:worker`). |
| **Type** | Enum | `system` (infra/app) or `user` (custom script metrics). |

### 2.1. Metric Semantics (Make Aggregation Explicit)
To keep metrics queryable and predictable, each metric name should imply:

*   **Kind:** counter / gauge / histogram
*   **Unit:** e.g., `ms`, `bytes`, `count`
*   **Aggregation intent:** counters are summed, gauges are last-value/avg, histograms drive p50/p95/p99.

Suggested convention:

*   `*.count` for counters
*   `*.duration_ms` for timings
*   `*.size_bytes` for sizes
*   `*.active` / `*.inflight` for gauges

### 2.2. Cardinality & PII Rules (Non-Negotiable)
**Avoid tags that explode cardinality or carry PII.**

*   Do **not** store raw `user_id`, `email`, `ip`, `user_agent`, `authorization` headers, full `redirect_uri`, or raw API key prefixes as metric tags.
*   Prefer **low-cardinality tags**: `route_id`, `method`, `status_class` (2xx/4xx/5xx), `result` (success/error/blocked), `trigger_event`.
*   If per-actor detail is needed, store it as an **audit/event log** (or reuse existing `pipeline_traces` / `abac_audit_logs`) and derive aggregates.
*   Enforce limits for user metrics: max tag keys, max tag value length, max points/minute per tenant.

## 3. Database Schema
We will add a new table `metrics` to the SQLite schema (Drizzle) stored on Turso/libSQL.

> [!IMPORTANT]
> **Write amplification warning:** storing one row per request can be expensive on serverless + libSQL.
> Prefer (a) deriving from existing tables, (b) sampling, or (c) batching/rollups.

**File:** `src/db/metrics-schema.ts` (to be created)

```typescript
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const metrics = sqliteTable("metrics", {
  id: text("id").primaryKey(), // UUID/CUID
  name: text("name").notNull(),
  value: real("value").notNull(), // Use real for flexibility (latency, counts)
  tags: text("tags", { mode: "json" }), // Store tags as JSON
  metricType: text("metric_type").notNull().default("system"), // 'system' | 'user'
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, (table) => ({
  nameIdx: index("idx_metrics_name").on(table.name),
  timestampIdx: index("idx_metrics_timestamp").on(table.timestamp),
  typeIdx: index("idx_metrics_type").on(table.metricType),
}));
```

### 3.1. Considered Schema Enhancements (Recommended)
If we expect meaningful volume, add a few **first-class columns** for common filters (cheaper than JSON tag scans):

*   `service` (`api`, `worker`, `cron`)
*   `route_id` (stable identifier, not raw path)
*   `client_id` (OAuth client id) — only if the tenant model needs it
*   `status` / `result` (success/error/blocked)

Keep tags JSON for optional dimensions.

### 3.2. Retention & Rollups
Turso/libSQL has no TTL; define both:

*   **Raw retention:** 7–30 days for raw metrics (depending on write volume)
*   **Rollup tables (optional):** hourly/day aggregates to support long-range charts cheaply

## 4. Architecture

### 4.1. Repository Layer
**File:** `src/lib/repositories/metrics-repository.ts`
Extends `BaseRepository` to handle database interactions.

*   `create(metric: CreateMetricDTO): Promise<Metric>`
*   `createBatch(metrics: CreateMetricDTO[]): Promise<void>` (For pipeline batching)
*   `findMetrics(name: string, from: Date, to: Date): Promise<Metric[]>`
*   `aggregate(name: string, type: 'avg'|'max'|'sum', interval: string): Promise<Result[]>`

### 4.2. Service Layer
**File:** `src/lib/services/metrics-service.ts`
High-level abstraction for recording metrics.

**Interface:**
```typescript
interface IMetricsService {
  count(name: string, value?: number, tags?: Record<string, string>): Promise<void>;
  gauge(name: string, value: number, tags?: Record<string, string>): Promise<void>;
  histogram(name: string, value: number, tags?: Record<string, string>): Promise<void>;
  
  // Helper for timing async functions
  measure<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T>;

  // Safe ingestion for user-defined metrics (enforces limits/prefixes)
  recordUserMetric(userId: string, name: string, value: number, type: 'count'|'gauge', tags?: Record<string, string>): Promise<void>;
}
```

### 4.3. Middleware / Interceptors
*   **API Middleware:** Wraps API route handlers to measure `http.request.duration` and record `http.request.count`.

> [!NOTE]
> **Next.js runtime constraint:** metrics writes require Node.js (because `@libsql/client`).
> Avoid edge runtime instrumentation and be explicit about which routes/actions are node-only.

## 5. Integration Points & Metrics to Track

### 5.0. "Derive First" Principle
Before adding new write-path metrics, check if the signal already exists in:

*   `pipeline_traces` / `pipeline_spans` (pipeline timing, failures, block reasons, per-script durations)
*   `abac_audit_logs` (authorization decision + timing)
*   Webhook tables in `src/db/app-schema.ts` (delivery outcomes, retries, latencies if stored)

When possible, build dashboards from these sources and only add `metrics` rows for gaps.

### 5.1. Authentication (`src/lib/auth.ts`)
| Metric Name | Type | Tags | Trigger Location | Status |
| :--- | :--- | :--- | :--- | :--- |
| `auth.login.attempt` | Count | `method`, `status` | `afterHook` | ✅ Implemented |
| `auth.register.success` | Count | `method` | `afterHook` | ✅ Implemented |
| `auth.email_verification.sent.count` | Count | `provider` | Email Service | ⏭️ Derived from email.send.success |
| `auth.email_verification.completed.count` | Count | `provider` | Verification Route | ❌ Not Implemented |
| `auth.password_reset.sent.count` | Count | `provider` | Password Reset | ⏭️ Derived from email.send.success |
| `auth.password_reset.completed.count` | Count | `provider` | Password Reset | ❌ Not Implemented |
| `auth.session.created.count` | Count | `provider` | `afterHook` | ✅ Implemented |
| `auth.session.revoked.count` | Count | `reason` | Session Service | ✅ Implemented |
| `auth.signup.blocked.count` | Count | `reason` | `auth-middleware.ts` | ✅ Implemented |

### 5.1.1 OAuth2 / OIDC Surface (High Value)
| Metric Name | Type | Tags | Notes | Status |
| :--- | :--- | :--- | :--- | :--- |
| `oidc.authorize.request.count` | Count | `result` | Route wrapper | ✅ Implemented |
| `oidc.authorize.latency_ms` | Histogram | `result` | Route wrapper | ✅ Implemented |
| `oidc.authorize.access_denied.count` | Count | `reason` | `beforeHook` | ✅ Implemented |
| `oidc.token.request.count` | Count | `grant_type`, `result` | Route wrapper | ✅ Implemented |
| `oidc.token.latency_ms` | Histogram | `grant_type`, `result` | Route wrapper | ✅ Implemented |
| `oidc.userinfo.request.count` | Count | `result` | Route wrapper | ✅ Implemented |
| `oidc.jwks.request.count` | Count | `result` | Route wrapper | ✅ Implemented |
| `oauth.redirect_uri.invalid.count` | Count | `client_type` | `afterHook` | ✅ Implemented |
| `oauth.pkce.failure.count` | Count | `reason` | `afterHook` | ✅ Implemented |

### 5.2. Authorization (ABAC/ReBAC) (`src/lib/auth/permission-service.ts`)
| Metric Name | Type | Tags | Trigger Location | Status |
| :--- | :--- | :--- | :--- | :--- |
| `authz.check.duration` | Histogram | `resource`, `action`, `result` | `checkPermission()` | ✅ Implemented |
| `authz.policy.duration` | Histogram | `policy_id`, `source` | `evaluatePolicy()` | ⚠️ Embedded in tuple check |
| `authz.rebac.traversal_depth` | Histogram | `entity_type` | `expandSubjects()` | ✅ Implemented |
| `authz.rebac.subjects_expanded` | Histogram | `entity_type` | `expandSubjects()` | ✅ Implemented |
| `authz.model.load_duration` | Histogram | `entity_type` | `modelService.getModel()` | ❌ Not Implemented |
| `authz.decision.count` | Count | `result`, `source` | `checkPermission()` | ✅ Implemented |
| `authz.error.count` | Count | `stage` | Multiple | ✅ Implemented |
| `rebac.query.count` | Count | `relation` | `expandSubjects()` | ⏭️ Derived from traces |

### 5.3. Pipelines & Lua Engine (`src/lib/auth/pipeline-engine.ts`)
**A. System Metrics (Infrastructure Health)**
| Metric Name | Type | Tags | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| `pipeline.exec.duration` | Histogram | `pipeline_id`, `status` | Total time | ✅ Implemented |
| `pipeline.node.overhead` | Histogram | `script_id` | JS setup vs Lua | ⚠️ Requires refactor |
| `lua.pool.active` | Gauge | - | Active engines | ✅ Implemented |
| `lua.pool.waiting` | Gauge | - | Waiting requests | ✅ Implemented |
| `lua.pool.exhausted` | Count | - | Pool at max | ✅ Implemented |

**B. User-Defined Metrics (Injected Helper)**
| Metric Name | Type | Tags | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| `helpers.metrics.count` | Count | user-defined | Via Lua | ✅ Implemented |
| `helpers.metrics.gauge` | Gauge | user-defined | Via Lua | ✅ Implemented |

### 5.5. Webhooks (`src/lib/webhooks/delivery-service.ts`)
| Metric Name | Type | Tags | Trigger Location | Status |
| :--- | :--- | :--- | :--- | :--- |
| `webhook.emit.count` | Count | `event_type` | `emitWebhookEvent` | ✅ Implemented |
| `webhook.emit.duration_ms` | Histogram | `event_type` | `emitWebhookEvent` | ✅ Implemented |
| `webhook.delivery.duration_ms` | Histogram | `status`, `response_code` | `deliverWebhook` | ✅ Implemented |
| `webhook.delivery.retry.count` | Count | `event_type`, `attempt_bucket` | Delivery Service | ⚠️ Handled by QStash |
| `qstash.signature.verify.fail.count` | Count | `queue` | Webhook Endpoint | ⚠️ No verification code |
| `qstash.publish.error.count` | Count | `queue` | `emitWebhookEvent` | ✅ Implemented |

### 5.6. JWKS & Key Management (`src/lib/jwks-rotation.ts`)
| Metric Name | Type | Tags | Notes | Status |
| :--- | :--- | :--- | :--- | :--- |
| `jwks.rotation.success` | Count | - | `rotateJwksIfNeeded` | ✅ Implemented |
| `jwks.rotation.error` | Count | - | `rotateJwksIfNeeded` | ⏭️ Implicit (no success) |
| `jwks.rotate.triggered.count` | Count | `reason` | interval/missing | ✅ Implemented |
| `jwks.rotate.duration_ms` | Histogram | `result` | Rotation timing | ✅ Implemented |
| `jwks.pruned.count` | Count | - | Keys deleted | ✅ Implemented |
| `jwks.prune.duration_ms` | Histogram | `result` | Prune timing | ✅ Implemented |
| `jwks.active_key.age_ms` | Gauge | - | Key staleness | ✅ Implemented |

### 5.7. API Keys (`src/lib/auth.ts` + `api-key-permission-resolver.ts`)
| Metric Name | Type | Tags | Notes | Status |
| :--- | :--- | :--- | :--- | :--- |
| `apikey.resolve.duration` | Histogram | `key_prefix` | `resolvePermissions` | ✅ Implemented |
| `apikey.groups.count` | Histogram | - | Groups per key | ✅ Implemented |
| `apikey.abac.required` | Count | `entity_type` | ABAC in JWT | ✅ Implemented |
| `apikey.auth.missing.count` | Count | - | Missing header | ✅ Implemented |
| `apikey.auth.invalid.count` | Count | `reason` | Invalid key | ✅ Implemented |
| `apikey.issued.count` | Count | `result` | Key creation | ✅ Implemented |
| `apikey.revoked.count` | Count | `reason` | Key revocation | ✅ Implemented |

### 5.8. External Services (Integrations)
| Metric Name | Type | Tags | Trigger / Notes | Status |
| :--- | :--- | :--- | :--- | :--- |
| `email.send.success` | Count | `type` | `send.ts` | ✅ Implemented |
| `email.send.error` | Count | `type` | `send.ts` | ✅ Implemented |
| `email.send.duration_ms` | Histogram | `type` | `send.ts` | ✅ Implemented |
| `email.send.rate_limited.count` | Count | `type` | `send.ts` | ✅ Implemented |
| `qstash.publish.count` | Count | `queue` | Delivery service | ⏭️ Derived from emit.count |
| `qstash.verify.error` | Count | - | Queue routes | ⚠️ No verification code |
| `redis.idempotency.hit` | Count | - | Deduplication | ⚠️ No Redis in use |
| `redis.request.error.count` | Count | `operation` | Redis failures | ⚠️ No Redis in use |
| `redis.request.latency_ms` | Histogram | `operation` | Redis timing | ⚠️ No Redis in use |

### 5.9. Admin Activity (`src/app/admin/*/actions.ts`)
| Metric Name | Type | Tags | Notes | Status |
| :--- | :--- | :--- | :--- | :--- |
| `admin.session.revoke` | Count | `actor_type` | Session actions | ✅ Implemented |
| `admin.stats.view` | Count | `actor_type` | Page tracking | ❌ Optional |
| `admin.permission_request.approve.count` | Count | `scope` | Request approval | ✅ Implemented |
| `admin.permission_request.reject.count` | Count | `scope` | Request rejection | ✅ Implemented |
| `admin.policy.change.count` | Count | `action` | Model create/update | ✅ Implemented |
| `admin.pipeline.graph.save.count` | Count | `result` | Graph save | ✅ Implemented |
| `admin.pipeline.secret.rotate.count` | Count | `result` | Secret rotation | ✅ Implemented |

### 5.10. HTTP / Route Health (System-wide)
| Metric Name | Type | Tags | Notes | Status |
| :--- | :--- | :--- | :--- | :--- |
| `http.request.count` | Count | `route_id`, `method`, `status_class` | Route counting | ⏭️ Tracked via auth routes |
| `http.request.duration_ms` | Histogram | `route_id`, `method`, `status_class` | Route timing | ⏭️ Tracked via auth routes |
| `http.request.size_bytes` | Histogram | `route_id`, `method` | Request size | ❌ Not Implemented |
| `http.response.size_bytes` | Histogram | `route_id`, `method`, `status_class` | Response size | ❌ Not Implemented |

---

## Status Legend

| Symbol | Meaning |
| :--- | :--- |
| ✅ | Implemented |
| ❌ | Not Implemented |
| ⚠️ | Blocked/Requires Refactor |
| ⏭️ | Derived from existing data |

---

## 6. Dashboard Strategy
We will build a dedicated "Observability" page in the Admin UI.

### Panel 1: System Health (Infrastructure)
*   **API Latency:** P95/P99 of `http.request.duration`.
*   **Lua Pool Health:** `lua.pool.active` vs `lua.pool.waiting`.
*   **JWKS Status:** Key age gauge (Green < 24h, Red > 48h).
*   **Queue Health:** QStash verification errors (Security alert).
*   **Email Delivery:** Success rate % (Resend).

### Panel 2: Pipeline Performance
*   **Throughput:** Executions per minute by `trigger_event`.
*   **System Overhead:** `PipelineEngine` logic vs `Script.Execution`.

### Panel 3: Security & Identity
*   **ReBAC Complexity:** Avg `authz.rebac.traversal_depth` (Performance warning if high).
*   **API Key Usage:** `apikey.abac.required` rate (Shows complexity of current auth models).
*   **Auth Failures:** Spikes in `auth.login.attempt` (status=fail).
*   **OIDC Health:** authorize/token/userinfo error rate, by error reason.
*   **JWT Phase:** Call latency during permissions resolution.
*   **ABAC Errors:** Spikes in `abac_audit_logs` where `result=error`.

### Panel 4: User Logic (Business)
*   **Custom Counters:** Aggregated user-defined metrics.

### Panel 5: Webhook Reliability
*   **Success Rate:** `webhook.emit.success` / `webhook.emit.attempt`.
*   **Latency:** `webhook.emit.duration` distribution.
*   **Queue Security:** QStash signature verification failures.
*   **Retries/Backoff:** Delivery retry counts and time-to-success.

### Panel 6: Admin Audit
*   **Interventions:** Count of `admin.session.revoke`.
*   **Activity:** Frequency of `admin.stats.view`.

## 7. Implementation Steps

1.  **Database:** Create `src/db/metrics-schema.ts`. ✅
2.  **Core:** Implement `MetricsRepository` and `MetricsService`. ✅
3.  **Instrumentation:**
    *   **Phase 1 (Critical):** Pipeline Engine, Lua Pool, PermissionService. ✅
    *   **Phase 2 (Security):** JWKS Rotation, API Key Resolver, Admin Actions. ✅
    *   **Phase 3 (Integrations):** Webhooks, Email (Resend). ✅
4.  **UI:** Build Admin Dashboard. ❌

## 8. Design Decisions & Constraints
1.  **Duplication Risk:** Pipeline timing is already captured in `pipeline_traces`/`pipeline_spans`. Metrics should be derived where possible to avoid double-writing, or stored as aggregates.
2.  **Runtime Constraint:** Metrics writes require Node.js runtime; avoid edge middleware instrumentation.
3.  **Retention:** Define retention + cleanup job for `metrics` (similar to `cleanup-traces`) and consider rollups.
4.  **Multi-tenancy:** If charts need per OAuth client/tenant metrics, ensure safe `client_id` handling (column vs tag) and consider redaction strategies for high-cardinality data.
