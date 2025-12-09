
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

- [x] **Admin UI: Trace Viewer**
    - [x] Route Refactoring (Tabs/Layout)
    - [x] Trace List View
    - [x] Trace Detail View (Waterfall)

## Phase 5: Cleanup & Security Improvements
- [x] **SafeFetch Improvements**
    - [x] Increase script timeout to 10s
    - [x] SSRF protection & HTTPS enforcement
- [x] **User-Defined Secrets**
    - [x] Encrypted storage & UI
- [x] **Code Cleanup**

## Phase 6: Ultimate Lua Editor Upgrade (NEW)
**Goal**: Transform the Lua editor into a desktop-class IDE experience.

- [x] **1. Robust Type Inference Engine**
    - [x] Define rich `LuaType` system (primitives, tables, functions, unions, contexts)
    - [x] Implement recursive type propagation (assignments, member access)
    - [x] Implement table constructor inference
    - [x] Implement function return type inference (helpers, built-ins, LuaDoc)
    - [x] Implement scope-aware AST traversal (shadowing, block scopes)

- [x] **2. Linter & Hover (Immediate Consumers)**
    - [x] Update `hover.ts` to display rich type information
    - [x] Update `linter.ts` to add read-only checks for global objects
    - [x] Update `linter.ts` to add variable shadowing warnings

- [ ] **3. Context-Aware Autocomplete**
    - [ ] Connect `autocomplete.ts` to the new `type-inference` engine
    - [ ] Implement smart field filtering based on inferred types
    - [ ] Enhance snippets with pre-filled arguments

- [ ] **4. Visual Enhancements**
    - [ ] Implement **Semantic Highlighting** (`semantic-highlighting.ts`) (Parameters, Globals, Upvalues)
    - [ ] Implement **Auto-Highlighting** (`document-highlights.ts`)
    - [ ] Implement **Inlay Hints** (`inlay-hints.ts`) (Parameter names, Inferred types)

- [ ] **5. Advanced Editing Tools**
    - [ ] Implement **Rename Symbol** (`rename.ts`) (Scope-safe transactional rename)
    - [ ] Implement **Code Actions** (`code-actions.ts`) (Quick Fixes: Add return, Remove unused)
    - [ ] Implement **Document Outline** (`outline.ts`)
