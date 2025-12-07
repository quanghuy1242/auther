# Pipeline System Implementation

- [/] **Core Infrastructure** <!-- id: 0 -->
    - [x] Create database schema (Scripts, Graph, Execution Plan) <!-- id: 1 -->
    - [x] **Refactor:** Extract `LuaEnginePool` from `src/lib/auth/policy-engine.ts` <!-- id: 22 -->
    - [x] Initialize `wasmoon` service/engine (Update to use Pool) <!-- id: 2 -->
    - [x] Implement `PipelineRepository` (CRUD for Scripts & Graph) <!-- id: 23 -->
    - [x] Implement secure sandbox and basic helpers (`log`, `hash`, `now`, `env`, `queueWebhook`) <!-- id: 3 -->
- [ ] **Integration** <!-- id: 4 -->
- [ ] **Integration** <!-- id: 4 -->
    - [ ] Implement `better-auth` hooks interception logic <!-- id: 5 -->
    - [ ] Wire up Blocking Hooks (Group 1) <!-- id: 6 -->
    - [ ] Wire up Side Effect Hooks (Group 2) <!-- id: 7 -->
    - [ ] Wire up Enrichment Hooks (Group 3) <!-- id: 8 -->
- [ ] **Admin UI: Graph Editor** <!-- id: 9 -->
    - [ ] Setup React Flow in `/admin/pipelines` <!-- id: 10 -->
    - [ ] Implement Trigger Nodes (Roots) <!-- id: 11 -->
    - [ ] Implement Script Nodes (Processors) <!-- id: 12 -->
    - [ ] Implement Wiring logic and Validation <!-- id: 13 -->
- [ ] **Admin UI: Script Editor** <!-- id: 14 -->
    - [ ] Create Editor Modal <!-- id: 15 -->
    - [ ] Integrate CodeMirror 6 with Lua syntax <!-- id: 16 -->
    - [ ] Implement Version History view <!-- id: 17 -->
- [ ] **Advanced Core Infrastructure (v3)** <!-- id: 18 -->
    - [ ] Refactor Schema: `pipeline_execution_plan` to support DAG (Layers) <!-- id: 22 -->
    - [ ] Implement `SafeFetch` helper with whitelist & secrets <!-- id: 23 -->
    - [x] Create 'Advanced DAG' test script (`06-advanced-dag-http.ts`) <!-- id: 10 -->
    - [x] Verify `safeFetch` with whitelisting and secrets <!-- id: 11 -->

## Phase 2: Integration & Hook Registry <!-- id: 12 -->
- [x] **Design Hook Registry** <!-- id: 13 -->
    - [x] Define `PipelineHook` interface with Zod schemas <!-- id: 14 -->
    - [x] Create `src/lib/pipelines/definitions.ts` with 16+ hooks <!-- id: 15 -->
- [x] **Implement Integration Layer** <!-- id: 16 -->
    - [x] Create `PipelineIntegrator` to wrap `better-auth` hooks <!-- id: 17 -->
    - [x] Wire up `before_signup`, `after_signup`, `after_signin` in `auth.ts` <!-- id: 18 -->
- [/] **Verification** <!-- id: 19 -->
    - [ ] Test blocking flow with real `better-auth` calls <!-- id: 20 -->
    - [ ] Test enrichment flow (Token generation) <!-- id: 21 -->
    - [ ] Refactor `PipelineEngine` for Layered/Parallel Execution <!-- id: 24 -->
    - [ ] Implement Fan-in Context Merging (`context.outputs`) <!-- id: 25 -->
    - [ ] Verify Advanced Scenarios (DAG, SafeFetch) <!-- id: 26 -->

## Phase 3: Safety & Hardening <!-- id: 30 -->
- [x] **Resource Limits** <!-- id: 31 -->
    - [x] Implement fetch timeout (3 seconds) <!-- id: 32 -->
    - [x] Pool throttling with queue (max 20 concurrent) <!-- id: 33 -->
    - [x] Chain depth validation (max 10 layers) <!-- id: 34 -->
    - [x] Parallel node validation (max 5 per layer) <!-- id: 35 -->
    - [x] Lua instruction limit (50k ops via debug hook) <!-- id: 36 -->
- [x] **Test Scripts** <!-- id: 37 -->
    - [x] Error handling tests (`07-error-handling.ts`) <!-- id: 38 -->
    - [x] Diamond DAG test (`08-diamond-dag.ts`) <!-- id: 39 -->
    - [x] Limits validation test (`09-limits.ts`) <!-- id: 40 -->
    - [x] Heavy computation test (`10-heavy-computation.ts`) <!-- id: 41 -->

## Phase 4: Observability <!-- id: 42 -->
- [x] **Schema & Backend** <!-- id: 43 -->
    - [x] Add `pipeline_traces` and `pipeline_spans` tables (OTEL-compatible)
    - [x] Add trace repository methods (`createTrace`, `createSpans`, etc.)
    - [x] Integrate tracing into `PipelineEngine`
    - [x] Create cleanup endpoint (`/api/internal/cleanup-traces`)
    - [x] Tracing test (`11-tracing.ts`)
- [ ] **Admin UI: Trace Viewer** <!-- id: 44 -->
    - [ ] Create `/admin/pipelines/traces` page
    - [ ] List recent traces with status, duration, trigger
    - [ ] Trace detail view with span waterfall/timeline
    - [ ] Filter by trigger event, status, date range
