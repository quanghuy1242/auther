# Pipeline Observability: Final Design

## Decisions Summary

| Decision | Choice |
|----------|--------|
| Table Structure | 2 tables: `pipeline_traces` + `pipeline_spans` |
| Smallest Span | Lua script execution |
| External Tracing | None, but OpenTelemetry-compatible schema |
| Retention | 30 days via manual cleanup job |

---

## Research Findings

### Turso TTL
**No native TTL support.** Turso/libSQL does not have automatic data expiration.

**Solution**: Implement scheduled cleanup:
```sql
DELETE FROM pipeline_spans WHERE started_at < unixepoch() - (30 * 24 * 60 * 60);
DELETE FROM pipeline_traces WHERE created_at < unixepoch() - (30 * 24 * 60 * 60);
```

Options for scheduling:
1. **Cron job** calling API endpoint
2. **Vercel Cron** (if deployed there)
3. **QStash** (Upstash scheduled tasks)
4. **Manual** via admin UI button

---

## OpenTelemetry-Compatible Schema

Following OTEL spec for future exportability:

```sql
-- Trace = 1 pipeline execution (1 trigger call)
CREATE TABLE pipeline_traces (
    -- OTEL: trace_id (16 bytes hex = 32 chars)
    id TEXT PRIMARY KEY,  -- UUID serves as trace_id
    
    -- Pipeline-specific
    trigger_event TEXT NOT NULL,  -- "before_signin"
    
    -- OTEL: status
    status TEXT NOT NULL,  -- "success" | "blocked" | "error"
    status_message TEXT,   -- Error details if any
    
    -- OTEL: timestamps (Unix ms for SQLite compat)
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_ms INTEGER,
    
    -- Context
    user_id TEXT,          -- Who triggered (if known)
    request_ip TEXT,
    context_snapshot TEXT, -- JSON: input context
    result_data TEXT,      -- JSON: merged output
    
    -- Housekeeping
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Span = 1 script execution within a trace
CREATE TABLE pipeline_spans (
    -- OTEL: span_id (8 bytes hex = 16 chars)
    id TEXT PRIMARY KEY,
    
    -- OTEL: trace_id reference
    trace_id TEXT NOT NULL REFERENCES pipeline_traces(id) ON DELETE CASCADE,
    
    -- OTEL: parent_span_id (for fan-in, not used initially)
    parent_span_id TEXT,
    
    -- OTEL: name
    name TEXT NOT NULL,  -- Script name: "Geo Blocker"
    
    -- OTEL: kind (all INTERNAL for us)
    kind TEXT NOT NULL DEFAULT 'INTERNAL',
    
    -- Pipeline-specific
    script_id TEXT NOT NULL,
    layer_index INTEGER NOT NULL,   -- 0, 1, 2...
    parallel_index INTEGER NOT NULL, -- Position within layer
    
    -- OTEL: status
    status TEXT NOT NULL,  -- "success" | "blocked" | "error" | "skipped"
    status_message TEXT,
    
    -- OTEL: timestamps
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_ms INTEGER,
    
    -- OTEL: attributes (as JSON)
    attributes TEXT,  -- JSON: { input_context, output_data }
    
    -- Indexes
    FOREIGN KEY (trace_id) REFERENCES pipeline_traces(id)
);

CREATE INDEX idx_spans_trace ON pipeline_spans(trace_id);
CREATE INDEX idx_traces_trigger ON pipeline_traces(trigger_event);
CREATE INDEX idx_traces_status ON pipeline_traces(status);
CREATE INDEX idx_traces_created ON pipeline_traces(created_at);
```

---

## Data Cleanup Strategy

### Option A: API Endpoint + External Cron (Recommended)

```typescript
// src/app/api/internal/cleanup-traces/route.ts
export async function POST(req: Request) {
    // Verify internal auth
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    await db.delete(pipelineSpans).where(lt(pipelineSpans.startedAt, thirtyDaysAgo));
    await db.delete(pipelineTraces).where(lt(pipelineTraces.createdAt, thirtyDaysAgo));
    return Response.json({ ok: true, cutoff: new Date(thirtyDaysAgo) });
}
```

Schedule via:
- Vercel Cron: `vercel.json` → runs daily
- QStash: Upstash scheduled HTTP call
- External cron hitting the endpoint

### Option B: On-Demand (Admin Button)
Add "Cleanup Old Traces" button in admin UI - manual trigger.

---

## Implementation Checklist

- [ ] Add schema to `src/db/pipeline-schema.ts`
- [ ] Run `db:generate` + `db:push`
- [ ] Create `TraceContext` class in engine
- [ ] Wrap `executeTrigger()` with trace creation
- [ ] Wrap `runScript()` with span creation
- [ ] Add cleanup API endpoint
- [ ] (Optional) Add trace viewer UI

**Effort: ~4-5 hours**

---

## User Review Required

> [!IMPORTANT]
> **Final confirmations:**
> 1. Schema looks good?
> 2. Cleanup via API + cron preferred?
> 3. Store `context_snapshot` and `result_data` as JSON strings?
