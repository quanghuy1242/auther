# Pipeline System Implementation

## Phase 1: Core Infrastructure
- [x] **Core Infrastructure**
    - [x] Create database schema (Scripts, Graph, Execution Plan)
    - [x] Extract `LuaEnginePool` from `src/lib/auth/policy-engine.ts`
    - [x] Initialize `wasmoon` service/engine (using Pool)
    - [x] Implement `PipelineRepository` (CRUD for Scripts & Graph)
    - [x] Implement secure sandbox and helpers (`log`, `hash`, `now`, `env`, `matches`, `fetch`)
    - [x] Implement `SafeFetch` helper with timeout
    - [x] Create DAG test scripts (`06-advanced-dag-http.ts`)

- [x] **Admin UI: Pipeline Editor** (Redesigned)
    - [x] ~~React Flow graph editor~~ → Replaced with **Swimlane Editor**
    - [x] Vertical stepper layout with accordion swimlanes
    - [x] Script Picker Modal (create new / attach existing)
    - [x] Ghost hook zones with drag-and-drop
    - [x] Mode-specific templates (blocking/async/enrichment)
    - [x] Parallel / Layered Script Execution Support (Visualized as card groups)

- [x] **Admin UI: Script Editor**
    - [x] Create Editor Modal
    - [x] Integrate CodeMirror 6 with Lua syntax
    - [x] Mode-specific default templates
    - [ ] Implement Version History view (deferred)

## Phase 2: Integration & Hook Registry
- [x] **Design Hook Registry**
    - [x] Define `PipelineHook` interface with Zod schemas
    - [x] Create `src/lib/pipelines/definitions.ts` with 16 hooks
    - [x] Create `src/schemas/pipelines.ts` for centralized schemas

- [x] **Implement Integration Layer**
    - [x] Create `PipelineIntegrator` (`src/lib/pipelines/integrator.ts`)
    - [x] Create `auth-hooks.ts` for pipeline-augmented hooks
    - [x] Wire up hooks in `auth.ts`

- [ ] **E2E Verification** (requires manual testing)
    - [ ] Test blocking flow with real `better-auth` calls
    - [ ] Test enrichment flow (Token generation)

## Phase 3: Safety & Hardening
- [x] **Resource Limits**
    - [x] Script size limit (5KB)
    - [x] Script timeout (1 second)
    - [x] Fetch timeout (3 seconds)
    - [x] Pool throttling with queue (max 20 concurrent)
    - [x] Chain depth validation (max 10 layers)
    - [x] Parallel node validation (max 5 per layer)
    - [x] Lua instruction limit (50k ops via debug hook)

- [x] **Sandbox Hardening** (SECURITY)
    - [x] Disable dangerous Lua globals (`os`, `io`, `package`, `loadfile`, `dofile`, `loadstring`, `rawset`, `rawget`)
    - [x] Add `helpers.matches()` for regex matching

- [x] **Test Scripts**
    - [x] Demo scripts (`01` - `05`)
    - [x] Advanced DAG test (`06-advanced-dag-http.ts`)
    - [x] Error handling tests (`07-error-handling.ts`)
    - [x] Diamond DAG test (`08-diamond-dag.ts`)
    - [x] Limits validation test (`09-limits.ts`)
    - [x] Heavy computation test (`10-heavy-computation.ts`)

## Phase 4: Observability
- [x] **Schema & Backend**
    - [x] Add `pipeline_traces` table (OTEL-compatible)
    - [x] Add `pipeline_spans` table (OTEL-compatible)
    - [x] Generate migration (`drizzle/0012_flashy_boomer.sql`)
    - [x] Add trace repository methods (`createTrace`, `createSpans`, `getTraceWithSpans`, `listTraces`, `cleanupOldTraces`)
    - [x] Integrate tracing into `PipelineEngine` (`saveTrace()` method)
    - [x] Create cleanup endpoint (`/api/internal/cleanup-traces`)
    - [x] Add cron to `vercel.json.bin` (daily 4am)
    - [x] Tracing test (`11-tracing.ts`)

- [ ] **Admin UI: Trace Viewer** (IN PROGRESS)
    
    ### Phase 4A: Route Refactoring ✅
    Convert pipelines from in-page tabs to route-based navigation for lazy loading.
    
    - [x] Create `/admin/pipelines/layout.tsx` with shared header + NavTabs
    - [x] Create `/admin/pipelines/pipeline-tabs.tsx` (Editor, Secrets, Traces)
    - [x] Create `/admin/pipelines/editor/page.tsx` (move SwimlaneEditor)
    - [x] Create `/admin/pipelines/secrets/page.tsx` (move SecretsManager)
    - [x] Create `/admin/pipelines/traces/page.tsx` (new)
    - [x] Add `loading.tsx` files for each sub-route
    - [x] Verify lazy loading works (`pnpm lint` passed)

    
    ### Phase 4B: Trace List View ✅
    Searchable, filterable table of recent traces.
    
    - [x] Add `getTraces()` action (with filters: trigger, status, date range)
    - [x] Add `getTraceWithSpans()` action
    - [x] Create `trace-list.tsx` component
      - Table: Trace ID, Trigger, Status badge, Duration, User, Time
      - Click row → open detail
    - [x] Create `trace-filters.tsx` component
      - Trigger dropdown, status dropdown
    - [x] Add empty state component (uses shared EmptyState)
    - [ ] Add pagination (Load More or infinite scroll) - deferred
    
    ### Phase 4C: Trace Detail View ✅
    Waterfall timeline visualization with span details.
    
    - [x] Create `trace-detail.tsx` (modal)
      - Trace metadata header
      - Waterfall timeline (integrated, not separate component)
      - Span detail panel
    - [x] Waterfall features:
      - Timeline scale (0ms → total duration)
      - Spans grouped by layerIndex (parallel = same layer)
      - Horizontal bars (width = duration, color = status)
      - Click bar → select span
    - [x] Span detail shows: script name, status, duration, layer index, attributes

    - [ ] Loading skeletons
    - [ ] Refresh button + auto-refresh toggle
    - [ ] Responsive design
    - [ ] Test with real auth flow traces

## Phase 5: Cleanup & Security Improvements (NEW)

- [x] **SafeFetch Improvements**
    - [x] Increase script timeout from 1s to 10s (fetch timeout is 3s, script needs more headroom)
    - [x] Remove domain whitelist (switch to "Trust Admin" model)
    - [x] Remove hardcoded mock secrets (`STRIPE_KEY`, `INTERNAL_API_KEY`)
    - [x] Add private IP blocking (SSRF protection: 127.x, 10.x, 192.168.x, 169.254.x, etc.)
    - [x] Add response size limit (1MB max)
    - [x] Enforce HTTPS-only (no plain HTTP)

- [x] **User-Defined Secrets**
    - [x] Create `pipeline_secrets` table (encrypted storage)
    - [x] Implement `helpers.secret()` to read from DB (uses existing AES-256-GCM encryption)
    - [x] Create Admin UI for secrets management (tabbed interface with Editor/Secrets)

- [x] **Code Cleanup**
    - [x] Remove `helpers.queueWebhook()` (stub, not connected to real webhooks)
    - [x] Delete dead code: `flow-editor.tsx`, `sidebar.tsx`, `pipeline-editor-client.tsx`, `node-types/`

---

## Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Core | ✅ Complete | Engine, repository, helpers done |
| Phase 1: UI | ✅ Complete | **Swimlane Editor** (replaced React Flow) |
| Phase 2: Integration | ✅ Complete | Hook registry, integrator done |
| Phase 2: E2E Tests | ❌ Pending | Needs manual testing |
| Phase 3: Resource Limits | ✅ Complete | All limits implemented & tested |
| Phase 3: Sandbox Hardening | ✅ Complete | Dangerous globals disabled, matches() added |
| Phase 4: Backend | ✅ Complete | Tracing schema, repository, engine |
| Phase 4: UI | 🟡 **IN PROGRESS** | Route refactoring + Trace Viewer |
| Phase 5: SafeFetch | ✅ Complete | SSRF protection, HTTPS-only, 10s timeout |
| Phase 5: Cleanup | ✅ Complete | Dead code removed |
| Phase 5: Secrets | ✅ Complete | Encrypted storage, tabbed UI |

### Key Files
- `src/lib/auth/pipeline-engine.ts` - Main execution engine with tracing
- `src/lib/auth/pipeline-repository.ts` - DB operations for scripts, graphs, traces, secrets
- `src/lib/auth/lua-engine-pool.ts` - Pooled Lua engine management
- `src/db/pipeline-schema.ts` - All pipeline tables (incl. `pipelineSecrets`)
- `src/lib/pipelines/` - Hook definitions and integration layer
- `src/components/admin/pipelines/` - Swimlane Editor, Secrets Manager UI

### Pending Work (Priority Order)
1. **Phase 4: Trace Viewer Page** - `/admin/pipelines/traces`
2. **Phase 2: E2E Testing** - Manual auth flow tests
3. **Phase 1: Version History** - Script version tracking (deferred)



