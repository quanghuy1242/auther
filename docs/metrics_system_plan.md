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

Enhance the existing `/admin` homepage with dynamic metrics visualization using **Recharts** (already installed). The dashboard retains the current layout pattern (stats cards → quick actions → data panels) while adding time-series charts and interactive controls.

### 6.1. Global Controls

#### Period Selector
A single period selector at the top of the dashboard applies to **all panels**:

| Period | Label | Data Points | Aggregation |
| :--- | :--- | :--- | :--- |
| 24h | Last 24 Hours | ~24 (hourly) | Hourly rollups |
| 7d | Last 7 Days | ~168 (hourly) or ~7 (daily) | Hourly/Daily |
| 30d | Last 30 Days | ~30 (daily) | Daily rollups |
| 12mo | Last 12 Months | ~12 (monthly) | Monthly rollups |

**Implementation:** `<Select>` component from Radix UI, stored in URL search params for shareability.

#### Auto-Refresh
- Auto-refresh every **15 seconds** when the browser tab is active
- Uses `visibilitychange` event to pause when tab is hidden
- Manual refresh button with loading state indicator
- Disable auto-refresh option (toggle)

**Implementation:** `useEffect` with `setInterval` + `document.visibilityState` check.

---

### 6.2. Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Period: [24h ▼]                           [↻ Auto-refresh: ON] │
├─────────────────────────────────────────────────────────────────┤
│                        QUICK STATS (4 cards)                    │
│  [Total Users] [OAuth Clients] [Active Sessions] [JWKS Health]  │
├─────────────────────────────────────────────────────────────────┤
│                      QUICK ACTIONS (3 cards)                    │
│     [Create User]    [Register Client]    [Rotate JWKS]         │
├────────────────────────────────┬────────────────────────────────┤
│   AUTHENTICATION ACTIVITY      │     AUTHORIZATION HEALTH       │
│   (AreaChart - stacked)        │     (BarChart - grouped)       │
├────────────────────────────────┴────────────────────────────────┤
│                      RECENT SIGN-INS (Table)                    │
├────────────────────────────────┬────────────────────────────────┤
│      PIPELINE EXECUTIONS       │       WEBHOOK RELIABILITY      │
│   (LineChart - by trigger)     │      (DonutChart + stats)      │
├────────────────────────────────┴────────────────────────────────┤
│                      ADMIN ACTIVITY (Table)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6.3. Chart Panels Detail

#### Panel A: Authentication Activity
**Chart Type:** `<AreaChart>` (stacked)  
**Purpose:** Show authentication volume and success/failure trends

| Metric | Series | Color |
| :--- | :--- | :--- |
| `auth.login.attempt` (status=success) | Successful Logins | Green |
| `auth.login.attempt` (status=fail) | Failed Logins | Red |
| `auth.register.success` | New Registrations | Blue |
| `auth.session.created.count` | Sessions Created | Purple |

**Aggregation:** Sum per time bucket  
**Tooltip:** Shows exact counts for each series

---

#### Panel B: Authorization Health
**Chart Type:** `<BarChart>` (grouped)  
**Purpose:** Compare authorization decision outcomes and performance

| Metric | Bar | Notes |
| :--- | :--- | :--- |
| `authz.decision.count` (result=allowed) | Allowed | Green |
| `authz.decision.count` (result=denied) | Denied | Orange |
| `authz.error.count` | Errors | Red |

**Secondary View (toggle):**
| Metric | Chart | Notes |
| :--- | :--- | :--- |
| `authz.check.duration` | LineChart (p50/p95) | Latency percentiles |
| `authz.rebac.traversal_depth` | Histogram bars | Distribution |
| `authz.rebac.subjects_expanded` | Histogram bars | Fan-out distribution |

---

#### Panel C: Pipeline Executions
**Chart Type:** `<LineChart>` (multi-series)  
**Purpose:** Track pipeline throughput by trigger event

| Metric | Series | Notes |
| :--- | :--- | :--- |
| `pipeline.exec.duration` | P50, P95 lines | Latency percentiles |
| Grouped by `trigger_event` tag | Separate lines | Top 5 triggers |

**Stat Cards (inline):**
| Metric | Display |
| :--- | :--- |
| `lua.pool.active` | Current gauge |
| `lua.pool.waiting` | Current gauge (alert if > 0) |
| `lua.pool.exhausted` | Total count in period |

---

#### Panel D: Webhook Reliability
**Chart Type:** `<PieChart>` / `<DonutChart>` + Stats  
**Purpose:** Show delivery success rate and failures

| Metric | Segment | Color |
| :--- | :--- | :--- |
| `webhook.emit.count` - errors | Successful | Green |
| `qstash.publish.error.count` | Failed | Red |

**Stat Cards (inline):**
| Metric | Display |
| :--- | :--- |
| `webhook.emit.duration_ms` | P95 latency |
| `webhook.delivery.duration_ms` | P95 delivery time |
| Total webhooks in period | Count |

---

#### Panel E: OIDC & OAuth Health
**Chart Type:** `<BarChart>` (horizontal, grouped by endpoint)  
**Purpose:** Show OIDC endpoint health at a glance

| Metric | Bar | Notes |
| :--- | :--- | :--- |
| `oidc.authorize.request.count` | Authorize | Group by result |
| `oidc.token.request.count` | Token | Group by grant_type |
| `oidc.userinfo.request.count` | UserInfo | Group by result |
| `oidc.jwks.request.count` | JWKS | Typically 100% success |

**Error Breakdown (expandable):**
| Metric | Display |
| :--- | :--- |
| `oidc.authorize.access_denied.count` | By reason |
| `oauth.redirect_uri.invalid.count` | Count |
| `oauth.pkce.failure.count` | By reason |

---

#### Panel F: API Key Usage
**Chart Type:** `<LineChart>` + Stat Cards  
**Purpose:** Track API key lifecycle and auth patterns

| Metric | Visualization |
| :--- | :--- |
| `apikey.issued.count` | Line (keys created over time) |
| `apikey.revoked.count` | Line (keys revoked over time) |
| `apikey.auth.invalid.count` | Bar (by reason) |
| `apikey.auth.missing.count` | Single stat |

**Stat Cards:**
| Metric | Display |
| :--- | :--- |
| `apikey.resolve.duration` | P95 latency |
| `apikey.groups.count` | Average groups per key |

---

#### Panel G: Email Delivery
**Chart Type:** `<AreaChart>` (stacked) + Stat Cards  
**Purpose:** Monitor email sending health

| Metric | Series | Color |
| :--- | :--- | :--- |
| `email.send.success` | Sent | Green |
| `email.send.error` | Failed | Red |
| `email.send.rate_limited.count` | Rate Limited | Yellow |

**Stat Cards:**
| Metric | Display |
| :--- | :--- |
| `email.send.duration_ms` | P95 latency |
| Success rate % | Calculated |

---

#### Panel H: JWKS Health
**Chart Type:** Stat Card with Status Indicator  
**Purpose:** Key rotation health at a glance

| Metric | Display | Alert Threshold |
| :--- | :--- | :--- |
| `jwks.active_key.age_ms` | "Key Age: X days" | Yellow > 25d, Red > 30d |
| `jwks.rotation.success` | Last rotation time | - |
| `jwks.rotate.duration_ms` | P95 rotation time | - |
| `jwks.pruned.count` | Keys pruned in period | - |

---

#### Panel I: Admin Activity
**Chart Type:** `<Table>` (recent activity log)  
**Purpose:** Audit trail for admin actions

| Metric | Row Display |
| :--- | :--- |
| `admin.session.revoke` | "Admin revoked session" |
| `admin.permission_request.approve.count` | "Request approved" |
| `admin.permission_request.reject.count` | "Request rejected" |
| `admin.policy.change.count` | "Auth model updated" |
| `admin.pipeline.graph.save.count` | "Pipeline saved" |
| `admin.pipeline.secret.rotate.count` | "Secret rotated" |

**Alternative View:** `<BarChart>` showing counts by action type

---

#### Panel J: User-Defined Metrics
**Chart Type:** Dynamic based on metric type  
**Purpose:** Display custom metrics from Lua scripts (`helpers.metrics.*`)

| Metric Type | Chart |
| :--- | :--- |
| `user.*.count` | LineChart (sum over time) |
| `user.*.gauge` | LineChart (last value over time) |

**Features:**
- Dropdown to select which user metric to display
- Auto-discover available user metrics from database

---

### 6.4. API Endpoints

New server actions in `/admin/actions.ts` for dashboard data:

| Action | Returns |
| :--- | :--- |
| `getMetricsTimeSeries(name, period, tags?)` | `{ timestamp, value }[]` |
| `getMetricsAggregate(name, period, aggregation)` | `{ sum, avg, p50, p95, count }` |
| `getMetricsBreakdown(name, period, groupBy)` | `{ [tagValue]: count }` |
| `getUserMetricNames()` | `string[]` (available user metrics) |

---

### 6.5. Component Structure

```
src/components/admin/dashboard/
├── DashboardHeader.tsx          # Period selector + refresh controls
├── QuickStats.tsx               # Existing stat cards (enhanced)
├── charts/
│   ├── AuthActivityChart.tsx    # Panel A
│   ├── AuthzHealthChart.tsx     # Panel B  
│   ├── PipelineChart.tsx        # Panel C
│   ├── WebhookChart.tsx         # Panel D
│   ├── OidcHealthChart.tsx      # Panel E
│   ├── ApiKeyChart.tsx          # Panel F
│   ├── EmailChart.tsx           # Panel G
│   ├── JwksHealthCard.tsx       # Panel H
│   └── UserMetricsChart.tsx     # Panel J
├── tables/
│   ├── RecentSignIns.tsx        # Existing (enhanced)
│   └── AdminActivityLog.tsx     # Panel I
└── hooks/
    ├── useMetricsQuery.ts       # Data fetching + caching
    └── useAutoRefresh.ts        # Auto-refresh logic
```

---

### 6.6. Recharts Usage Notes

**Already Installed:** `recharts@3.3.0`

**Common Patterns:**
```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <XAxis dataKey="timestamp" tickFormatter={formatTime} />
    <YAxis />
    <Tooltip />
    <Line type="monotone" dataKey="value" stroke="#8884d8" />
  </LineChart>
</ResponsiveContainer>
```

**Color Palette:**
| Purpose | Color | Hex |
| :--- | :--- | :--- |
| Success / Allowed | Green | `#22c55e` |
| Error / Denied | Red | `#ef4444` |
| Warning | Yellow | `#eab308` |
| Primary / Info | Blue | `#3b82f6` |
| Secondary | Purple | `#a855f7` |
| Neutral | Gray | `#6b7280` |

---

### 6.7. Data Sources & Fetching Strategy

The dashboard pulls data from **three sources**: the `metrics` table, existing application tables, and derived aggregates.

#### Primary Data Sources

| Source | Table(s) | Data Available |
| :--- | :--- | :--- |
| **Metrics Table** | `metrics` | All instrumented metrics (see inventory below) |
| **Pipeline Traces** | `pipeline_traces`, `pipeline_spans` | Execution history, durations, status, trigger events |
| **ABAC Audit Logs** | `abac_audit_logs` | Authorization decisions, execution time |
| **Sessions** | `session` | Active session count, login history |
| **Users** | `user` | Total users, verified/unverified counts |
| **OAuth Clients** | `oauth_application` | Client count, trusted vs dynamic |
| **JWKS** | `jwks` | Key count, key ages, rotation history |
| **Webhooks** | `webhook_event`, `webhook_delivery` | Delivery history, success/failure |
| **API Keys** | `apikey` | Key count, lifecycle dates |

#### Available Metrics Inventory (✅ Implemented Only)

> [!IMPORTANT]
> The dashboard MUST only query metrics from this list. Metrics marked as ❌/⚠️ in Section 5 are not available.

**Authentication & Sessions:**
- `auth.login.attempt` (tags: `method`, `status`)
- `auth.register.success` (tags: `method`)
- `auth.session.created.count`
- `auth.session.revoked.count` (tags: `reason`)
- `auth.signup.blocked.count` (tags: `reason`)

**OIDC & OAuth:**
- `oidc.authorize.request.count` (tags: `result`)
- `oidc.authorize.latency_ms` (tags: `result`)
- `oidc.authorize.access_denied.count` (tags: `reason`)
- `oidc.token.request.count` (tags: `grant_type`, `result`)
- `oidc.token.latency_ms` (tags: `grant_type`, `result`)
- `oidc.userinfo.request.count` (tags: `result`)
- `oidc.jwks.request.count` (tags: `result`)
- `oauth.redirect_uri.invalid.count`
- `oauth.pkce.failure.count` (tags: `reason`)

**Authorization:**
- `authz.check.duration` (tags: `resource`, `action`, `result`)
- `authz.rebac.traversal_depth` (tags: `entity_type`)
- `authz.rebac.subjects_expanded` (tags: `entity_type`)
- `authz.decision.count` (tags: `result`, `source`)
- `authz.error.count` (tags: `stage`)

**Pipelines & Lua:**
- `pipeline.exec.duration` (tags: `pipeline_id`, `status`)
- `lua.pool.active` (gauge)
- `lua.pool.waiting` (gauge)
- `lua.pool.exhausted`

**Webhooks:**
- `webhook.emit.count` (tags: `event_type`)
- `webhook.emit.duration_ms` (tags: `event_type`)
- `webhook.delivery.duration_ms` (tags: `status`, `response_code`)
- `qstash.publish.error.count`

**JWKS:**
- `jwks.rotation.success`
- `jwks.rotate.triggered.count` (tags: `reason`)
- `jwks.rotate.duration_ms` (tags: `result`)
- `jwks.pruned.count`
- `jwks.prune.duration_ms` (tags: `result`)
- `jwks.active_key.age_ms` (gauge)

**API Keys:**
- `apikey.resolve.duration` (tags: `key_prefix`)
- `apikey.groups.count`
- `apikey.abac.required` (tags: `entity_type`)
- `apikey.auth.missing.count`
- `apikey.auth.invalid.count` (tags: `reason`)
- `apikey.issued.count`
- `apikey.revoked.count` (tags: `reason`)

**Email:**
- `email.send.success` (tags: `type`)
- `email.send.error` (tags: `type`)
- `email.send.duration_ms` (tags: `type`)
- `email.send.rate_limited.count` (tags: `type`)

**Admin Activity:**
- `admin.session.revoke`
- `admin.permission_request.approve.count`
- `admin.permission_request.reject.count`
- `admin.policy.change.count` (tags: `action`)
- `admin.pipeline.graph.save.count`
- `admin.pipeline.secret.rotate.count`

**User-Defined (via Lua):**
- `user.*` (prefix applied automatically)

---

#### Data Fetching Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dashboard Page (RSC)                         │
│  - Fetches initial data server-side                             │
│  - Passes to client components                                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐       ┌─────────────────────────────────┐
│  Server Actions     │       │  Client Refresh (15s interval)  │
│  (getDashboardStats,│       │  (useEffect + fetch)             │
│   getMetrics*, etc) │       │                                  │
└─────────┬───────────┘       └────────────────┬──────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MetricsRepository                          │
│  - findByName(name, from, to)                                   │
│  - aggregate(name, from, to, groupBy?)                          │
│  - getLatestGauge(name)                                         │
└─────────────────────────────────────────────────────────────────┘
```

#### Server Actions

| Action | Query Source | Returns |
| :--- | :--- | :--- |
| `getDashboardStats()` | `user`, `session`, `oauth_application`, `jwks` | Static counts (existing) |
| `getMetricsTimeSeries(name, period, tags?)` | `metrics` table | `{ timestamp, value }[]` |
| `getMetricsAggregate(name, period, agg)` | `metrics` table | `{ sum, avg, p50, p95, count }` |
| `getMetricsBreakdown(name, period, groupBy)` | `metrics` table | `{ [tagValue]: number }` |
| `getPipelineStats(period)` | `pipeline_traces` | Execution counts, avg duration |
| `getRecentSignIns(limit)` | `session` | Recent sessions (existing) |
| `getUserMetricNames()` | `metrics` WHERE type='user' | Distinct user metric names |

#### Aggregation Strategy

| Period | Bucket Size | Max Data Points |
| :--- | :--- | :--- |
| 24h | 1 hour | 24 |
| 7d | 6 hours | 28 |
| 30d | 1 day | 30 |
| 12mo | 1 month | 12 |

**SQL Example (time-series aggregation):**
```sql
SELECT 
  (timestamp / 3600000) * 3600000 AS bucket, -- Hourly buckets
  SUM(value) AS total,
  AVG(value) AS avg
FROM metrics
WHERE name = 'auth.login.attempt'
  AND timestamp >= :from AND timestamp <= :to
  AND json_extract(tags, '$.status') = 'success'
GROUP BY bucket
ORDER BY bucket;
```

#### Caching Strategy

| Data Type | Cache TTL | Strategy |
| :--- | :--- | :--- |
| Static counts (users, clients) | 60s | Revalidate on demand |
| Time-series data | 15s | Auto-refresh replaces cache |
| Gauge values (lua.pool.*) | 0s | Always fresh |
| Aggregates (p95, avg) | 60s | Longer TTL, less volatile |

---

### 6.8. Panel to Data Source Mapping

| Panel | Primary Data Source | Metrics Used |
| :--- | :--- | :--- |
| **Quick Stats** | `user`, `session`, `oauth_application`, `jwks` | None (direct table queries) |
| **Auth Activity** | `metrics` | `auth.login.attempt`, `auth.register.success`, `auth.session.created.count` |
| **Authz Health** | `metrics` | `authz.decision.count`, `authz.error.count`, `authz.check.duration` |
| **Recent Sign-Ins** | `session` | None (direct table query) |
| **Pipeline Executions** | `metrics` + `pipeline_traces` | `pipeline.exec.duration`, `lua.pool.*` |
| **Webhook Reliability** | `metrics` | `webhook.emit.count`, `webhook.emit.duration_ms`, `qstash.publish.error.count` |
| **OIDC Health** | `metrics` | `oidc.*.request.count`, `oidc.*.latency_ms`, `oauth.*` |
| **API Key Usage** | `metrics` | `apikey.issued.count`, `apikey.revoked.count`, `apikey.auth.*` |
| **Email Delivery** | `metrics` | `email.send.success`, `email.send.error`, `email.send.duration_ms` |
| **JWKS Health** | `metrics` + `jwks` | `jwks.active_key.age_ms`, `jwks.rotation.success` |
| **Admin Activity** | `metrics` | `admin.*` |
| **User Metrics** | `metrics` WHERE type='user' | Dynamic discovery |

## 7. Implementation Steps

1.  **Database:** Create `src/db/metrics-schema.ts`. ✅
2.  **Core:** Implement `MetricsRepository` and `MetricsService`. ✅
3.  **Instrumentation:**
    *   **Phase 1 (Critical):** Pipeline Engine, Lua Pool, PermissionService. ✅
    *   **Phase 2 (Security):** JWKS Rotation, API Key Resolver, Admin Actions. ✅
    *   **Phase 3 (Integrations):** Webhooks, Email (Resend). ✅
4.  **UI:** Build Admin Dashboard. ✅

## 8. Design Decisions & Constraints
1.  **Duplication Risk:** Pipeline timing is already captured in `pipeline_traces`/`pipeline_spans`. Metrics should be derived where possible to avoid double-writing, or stored as aggregates.
2.  **Runtime Constraint:** Metrics writes require Node.js runtime; avoid edge middleware instrumentation.
3.  **Retention:** Define retention + cleanup job for `metrics` (similar to `cleanup-traces`) and consider rollups.
4.  **Multi-tenancy:** If charts need per OAuth client/tenant metrics, ensure safe `client_id` handling (column vs tag) and consider redaction strategies for high-cardinality data.
