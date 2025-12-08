# Conversation Summary - Pipeline Observability (2025-12-07)

## USER Objective
Design and implement **Pipeline Observability** - audit logging and distributed tracing for the Lua pipeline system.

---

## What Was Accomplished

### Phase 4: Observability (COMPLETE)

**1. Schema Design** (`src/db/pipeline-schema.ts`)
- Added `pipeline_traces` table (12 columns) - one per trigger execution
- Added `pipeline_spans` table (14 columns) - one per script execution
- OTEL-compatible fields: `trace_id`, `span_id`, `parent_span_id`, `kind`, `status`, timestamps, `attributes`
- Migration generated: `drizzle/0012_flashy_boomer.sql`

**2. Repository Methods** (`src/lib/auth/pipeline-repository.ts`)
- `createTrace()` - Insert trace record
- `createSpans()` - Insert span records (batch)
- `getTraceWithSpans()` - Retrieve trace with all spans
- `listTraces()` - List recent traces (with optional trigger filter)
- `cleanupOldTraces()` - Delete records older than cutoff date

**3. Engine Integration** (`src/lib/auth/pipeline-engine.ts`)
- `executeTrigger()` now accepts optional `metadata?: { userId?, requestIp? }`
- Spans collected for each script execution with timing, status, attributes
- `saveTrace()` private method uses repository (fire-and-forget, non-blocking)
- Traces finalized on both success and blocked paths

**4. Cleanup Endpoint** (`src/app/api/internal/cleanup-traces/route.ts`)
- CRON_SECRET authentication (same pattern as `rotate-jwks`)
- 30-day retention policy
- Uses `pipelineRepository.cleanupOldTraces()`

**5. Cron Job** (`vercel.json.bin`)
- Added `/api/internal/cleanup-traces` at `0 4 * * *` (daily 4am)

**6. Test Script** (`scripts/pipelines/11-tracing.ts`)
- Test 1: Success path tracing ✅
- Test 2: Blocked path tracing ✅  
- Test 3: Multi-layer DAG tracing ✅

---

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| ABAC audit table reuse | **Not suitable** - different domain (permission checks vs pipeline flows) |
| Table structure | **Normalized**: `traces` + `spans` (2 tables) |
| OpenTelemetry | **Schema-compatible** (can export later), no external integration now |
| Retention | **30 days** via scheduled cleanup (Turso has NO native TTL) |
| DB access pattern | **Repository pattern** - no direct `db.insert` in engine |

---

## Files Modified/Created

| File | Change |
|------|--------|
| `src/db/pipeline-schema.ts` | Added `pipelineTraces`, `pipelineSpans` tables |
| `src/lib/auth/pipeline-repository.ts` | Added 5 trace methods |
| `src/lib/auth/pipeline-engine.ts` | Added tracing instrumentation, metadata param |
| `src/app/api/internal/cleanup-traces/route.ts` | **NEW** - cleanup endpoint |
| `vercel.json.bin` | Added cleanup-traces cron |
| `scripts/pipelines/11-tracing.ts` | **NEW** - tracing test |
| `docs/9_pipeline_task.md` | Added Phase 4 tasks |
| `docs/9_pipeline_observability.md` | **NEW** - design doc |

---

## Pending UI Work (Phase 4 remaining)

```markdown
- [ ] Admin UI: Trace Viewer
    - [ ] Create `/admin/pipelines/traces` page
    - [ ] List recent traces with status, duration, trigger
    - [ ] Trace detail view with span waterfall/timeline
    - [ ] Filter by trigger event, status, date range
```

---

## Technical Notes

- **Turso DB**: No native TTL - manual cleanup required
- **Lint status**: 0 errors, 3 warnings (all pre-existing unrelated)
- **Tests**: All 11 pipeline tests passing when DB is running
- **DB Push**: Schema already applied (`pnpm db:push` showed "No changes")

---

## Drizzle Migration Status (still inconsistent)
- Using `db:push` workflow (not `db:migrate`)
- `__drizzle_migrations` table likely empty
- Migration files exist but weren't applied via migrate command
- Recommend baselining if switching to `db:migrate` in future
