# Lua Pipeline System - Comprehensive Design v2

Runtime customizable authentication flows through stored Lua scripts executed at better-auth lifecycle events.

---

## Purpose & Scope
Defines how we enable runtime-auth pipelines (design, security, UI, data model, and delivery plan) without redeploys. Centers on Lua scripts executed during better-auth lifecycle events.

## Audience & How to Use This Document
- Product/architecture: read the intro and Security Posture to understand the risk-first ordering.
- Backend: focus on Trigger-Driven Architecture and Database Schema.
- Frontend: use UI Architecture and Component Structure.
- Ops/QA: consult Audit & History, Plugin system, and Phase Summary for rollout.

## Why Security Leads (HTTP Module First)
The HTTP module is addressed first because enabling outbound calls from scripts is the highest-risk capability. Decisions here constrain the rest of the system (sandboxing, helper APIs, and allowed side effects).

---

## Quick Navigation
- [1. Security Posture & HTTP Module Decision](#1-security-posture--http-module-decision)
- [2. System Architecture](#2-system-architecture)
  - [2.1 Trigger-Driven Architecture (Unified Script Nodes)](#21-trigger-driven-architecture-unified-script-nodes)
  - [2.2 UI Architecture - The Auth Circuit Board](#22-ui-architecture---the-auth-circuit-board)
  - [2.3 Database Schema (Graph Support)](#23-database-schema-graph-support)
- [3. Operations & Observability](#3-operations--observability)
- [4. Extensibility (Plugin/Module System)](#4-extensibility-pluginmodule-system)
- [5. Implementation Footprint](#5-implementation-footprint)
- [6. Phase Summary](#6-phase-summary)

---

## 1. Security Posture & HTTP Module Decision

### Recommendation: **DISABLED by default**

| Risk | Impact | Why It's Dangerous |
|------|--------|-------------------|
| **Data Exfiltration** | Critical | Script can send `context.user.email`, passwords, tokens to attacker-controlled servers |
| **SSRF** | Critical | Can probe internal network (`http://localhost:8080/admin`, `http://192.168.x.x`) |
| **C2 Channel** | High | Establish command-and-control, download payloads |
| **DoS Amplification** | High | Script can flood external services, making your server the attack source |

### Alternative: Use Existing Webhooks

For users needing to sync data externally, leverage the webhook system:

```lua
-- Pipeline script flags data for webhook delivery
helpers.queueWebhook("user.signup.custom", {
  email = context.email,
  source = "campaign_123"
})
return { allowed = true }
```

This keeps pipeline execution fast and secure while enabling async external data sync.

---

## 2. System Architecture

High-level flow: triggers fire during auth lifecycle -> scripts execute within sandboxed nodes -> optional UI graph wiring -> persisted graph/layout feeds runtime execution plans.

### 2.1 Trigger-Driven Architecture (Unified Script Nodes)

**Core Philosophy:**
We do NOT categorize scripts as "Blocking" or "Async". A script is just a logic unit (`f(context) -> result`).
The **Trigger** (Root Node) dictates how the chain behaves, not the script itself.

#### 2.1a. Trigger-Determined Execution Modes

| Trigger Group | Execution Mode | Behavior on `allowed: false` | Behavior on `data` return |
| :--- | :--- | :--- | :--- |
| **Before Hooks**<br>(`before_signup`, `before_signin`, etc.) | **Sync / Blocking** | **ABORT REQUEST**<br>The user action is rejected. | Ignored (unless passed to next node). |
| **After Hooks**<br>(`after_signup`, `after_signin`, etc.) | **Async / Fire-and-Forget** | **STOP CHAIN**<br>Stops executing *subsequent* nodes in this chain, but the user action has already succeeded. | Ignored. |
| **Build Hooks**<br>(`token_build`) | **Sync / Enriching** | **ABORT GENERATION**<br>Token generation fails. | **MERGE**<br>The returned `data` object is merged into the target (e.g., JWT claims). |

#### 2.1b. Trigger Inventory by Group

##### Group 1: Access Control (Blocking)
*Execution: Synchronous. Fast execution required.*
*   `before_signup`: Validate email domain, check IP reputation.
*   `before_signin`: Check ban status, maintenance mode.
*   `before_signout`: Prevent signout (rare, but possible).
*   `apikey_before_create`: Enforce max keys per user.
*   `apikey_before_exchange`: Validate key origin.
*   `apikey_before_revoke`: Prevent accidental deletion.
*   `client_before_register`: Validate OAuth App metadata.
*   `client_before_authorize`: Scope validation.

##### Group 2: Side Effects (Async)
*Execution: Background Job. Time limit more generous.*
*   `after_signup`: Send welcome email, sync to CRM.
*   `after_signin`: Log audit trail, update "last seen".
*   `apikey_after_create`: Notify security team.
*   `apikey_after_exchange`: Audit log usage.
*   `client_after_register`: Internal notification.
*   `client_after_authorize`: Analytics.
*   `client_access_change`: Log scope changes.

##### Group 3: Enrichment (Merge)
*Execution: Synchronous. Modifies Output.*
*   `token_build`: Inject custom claims (e.g., `role`, `subscription_tier`) into the JWT/Session.

#### 2.1c. Execution Mode Behaviors (Reference)

| Execution Mode | Behavior on `allowed: false` | Behavior on `data` return |
| :--- | :--- | :--- |
| **Sync / Blocking** | **ABORT REQUEST**<br>The user action is rejected. | Ignored (unless passed to next node). |
| **Async / Fire-and-Forget** | **STOP CHAIN**<br>Stops executing *subsequent* nodes in this chain. | Ignored. |
| **Sync / Enriching** | **ABORT GENERATION**<br>Token generation fails. | **MERGE**<br>Merged into target (e.g., JWT claims). |

#### 2.1d. Complete Hooks Inventory (16 Hooks)

##### Authentication Lifecycle
| Hook | Execution Mode | Context | Use Case |
|------|----------------|---------|----------|
| `before_signup` | Blocking | `{ email, name, request }` | Domain restriction, captcha |
| `after_signup` | Async | `{ user, request }` | Welcome flow, CRM sync |
| `before_signin` | Blocking | `{ email, request }` | Account lockout, IP block |
| `after_signin` | Async | `{ user, session }` | Last login, audit |
| `before_signout` | Blocking | `{ user, session }` | Cleanup, invalidation |
| `token_build` | Enriching | `{ user, token }` | Custom JWT claims |

##### API Key Lifecycle
| Hook | Execution Mode | Context | Use Case |
|------|----------------|---------|----------|
| `apikey_before_create` | Blocking | `{ userId, name, permissions }` | Restrict key creation |
| `apikey_after_create` | Async | `{ apikey, userId }` | Audit, notify |
| `apikey_before_exchange` | Blocking | `{ apikey, request }` | Extra validation |
| `apikey_after_exchange` | Async | `{ apikey, jwt }` | Logging |
| `apikey_before_revoke` | Blocking | `{ apikey }` | Prevent revocation |

##### OAuth Client Lifecycle
| Hook | Execution Mode | Context | Use Case |
|------|----------------|---------|----------|
| `client_before_register` | Blocking | `{ name, redirectUrls, type }` | Restrict registration |
| `client_after_register` | Async | `{ client }` | Notify, setup defaults |
| `client_before_authorize` | Blocking | `{ user, client, scopes }` | Scope validation |
| `client_after_authorize` | Async | `{ user, client, grant }` | Audit consent |
| `client_access_change` | Async | `{ user, client, action }` | Log access grant/revoke |

### 2.2 UI Architecture - The Auth Circuit Board

**Decision: Single Graph "Circuit Board" Editor (React Flow)**

Instead of a fragmented list of scripts, the Admin manages a single **Flow Graph**. This allows intuitive wiring of logic chunks and dependency management in a single view.

#### 2.2a. The Canvas (`/admin/pipelines`)
*   **Roots (Triggers):** Fixed, permanent nodes on the left.
    *   **Visual Cues:**
        *   🔴 **Red Border:** Blocking Triggers (Danger Zone).
        *   🟢 **Green Border:** Async Triggers (Safe Zone).
        *   🔵 **Blue Border:** Enrichment Triggers.
*   **Processors (Nodes):** Generic "Script Nodes".
    *   **Universal Compatibility:** Any script node can be connected to any trigger.
    *   **Shared Nodes:** A single script node can have multiple input wires.
        *   *Example:* A "Log to Splunk" script connected to `after_signin`, `after_signup`, and `apikey_create`.
*   **Wires (Edges):** Define the execution order.
*   **Flow:** Linear Chaining. `Trigger -> Node A -> Node B -> End`.

#### 2.2b. The Modal Editor
Clicking a node opens a **Modal Dialog** to edit the node's logic.

##### Editor Tech: CodeMirror 6
**Phase 1: Basic**
*   Lua syntax highlighting.
*   Dark theme matching admin UI.
*   Inline validation errors.

**Phase 2: Enhanced (LSP)**
*   **Architecture:** Browser (CodeMirror) <-> WebSocket <-> `lsp-ws-proxy` <-> LuaLS.
*   **Benefits:** Real-time type checking, hover documentation, and auto-complete for `context.*`.

#### 2.2c. Data Flow & Chaining Strategy

**Mechanism:**
1.  **Trigger:** Provides initial `context` (e.g., `{ email: "..." }`).
2.  **Node A Execution:**
    *   Receives `context`.
    *   Returns `{ allowed: true, data: { riskScore: 85 } }`.
3.  **Context Passing:**
    *   The system captures the `data` returned by Node A.
    *   It injects this into the `context` for the next node as `context.prev`.
4.  **Node B Execution:**
    *   Receives `context` (original) AND `context.prev` (result from A).
    *   *Logic:* `if context.prev.riskScore > 80 then return { allowed: false } end`.

### 2.3 Database Schema (Graph Support)

To support the "Circuit Board" and "Shared Nodes", we split storage into **Logic** (Scripts) and **Layout** (Graph).

#### 1. `pipeline_scripts` (The Logic)
Stores the reusable code blocks.
```sql
CREATE TABLE pipeline_scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,      -- The Lua source
  config TEXT,             -- JSON: Default variables
  created_at INTEGER,
  updated_at INTEGER
);
```

#### 2. `pipeline_graph` (The Layout)
Stores the React Flow state. Single row for single-tenant.
```sql
CREATE TABLE pipeline_graph (
  id TEXT PRIMARY KEY,     -- 'default'
  nodes TEXT NOT NULL,     -- JSON: [{ id: "node_1", data: { scriptId: "script_A" }, position: {x,y} }]
  edges TEXT NOT NULL,     -- JSON: [{ source: "trigger_signup", target: "node_1" }]
  updated_at INTEGER
);
```

#### 3. `pipeline_execution_plan` (Runtime Optimization)
A derived table (or cached view) updated whenever the Graph is saved. This allows the backend to find the path instantly without traversing the graph JSON.
```sql
CREATE TABLE pipeline_execution_plan (
  trigger_event TEXT PRIMARY KEY, -- e.g., 'before_signup'
  node_order TEXT NOT NULL        -- JSON Array: ["script_A", "script_B"]
);
```

---

## 3. Operations & Observability

### Audit & History Pages

#### Version History (`/admin/pipelines/nodes/[id]/versions`)
*   Since nodes are individual entities, we track history per **Script ID**.
*   Modal shows a "History" tab to rollback code changes.

#### Execution Logs (`/admin/pipelines/logs`)
*   **Real-time tail:** Auto-refresh last 100 executions.
*   **Trace View:** For a graph execution, show the path taken:
    *   `before_signup (Success)` -> `Node A (Success)` -> `Node B (Blocked)`.

---

## 4. Extensibility (Plugin/Module System)

### Architecture
```
┌─────────────────────────────────────────────────────┐
│                    Pipeline Script                   │
│  helpers.rateLimit(...)  helpers.sendSlack(...)     │
└──────────────────┬──────────────────────────────────┘
                   │ calls
┌──────────────────▼──────────────────────────────────┐
│                Helper Registry                       │
│  Built-in: rateLimit, log, hash                     │
│  Plugins:  sendSlack, verifyRecaptcha, lookupGeo   │
└──────────────────┬──────────────────────────────────┘
```

### Built-in Helpers (Day 1)
| Helper | Description | Example |
|--------|-------------|---------|
| `helpers.log(data)` | Write to execution log | `helpers.log({ action = "blocked" })` |
| `helpers.hash(text, algo)` | SHA256/MD5 hash | `helpers.hash(email, "sha256")` |
| `helpers.rateLimit(opts)` | Check rate limit | `helpers.rateLimit({ key = ip, limit = 5 })` |
| `helpers.matches(str, pattern)` | Regex match | `helpers.matches(email, "^.*@company%.com$")` |
| `helpers.now()` | Current timestamp | `helpers.now()` |
| `helpers.env(key)` | Safe env access (whitelist) | `helpers.env("ALLOWED_DOMAINS")` |
| `helpers.queueWebhook(event, data)` | Queue webhook delivery | `helpers.queueWebhook("custom.event", {...})` |

### Plugin Storage
*   **SaaS/Database:** `pipeline_plugins` table.
*   **Opensource/Git:** `./plugins/` filesystem.

---

## 5. Implementation Footprint

### Component Structure

```
src/app/admin/pipelines/
├── page.tsx                        # Main Graph Editor (React Flow)
├── layout.tsx
├── _components/
│   ├── flow-editor.tsx             # The React Flow Canvas
│   ├── sidebar.tsx                 # Toolbox (Drag & Drop Nodes)
│   ├── node-types/
│   │   ├── trigger-node.tsx        # Fixed Root Nodes
│   │   └── script-node.tsx         # Reusable Script Nodes
│   ├── editor-modal/               # The "Modal"
│   │   ├── index.tsx
│   │   ├── code-editor.tsx         # CodeMirror 6 (w/ LSP integration)
│   │   ├── history-view.tsx
│   │   └── test-runner.tsx
│   └── controls.tsx
```

---

## 6. Phase Summary

| Phase | Scope |
|-------|-------|
| **1** | Core: Schema (Graph + Scripts), Engine (Wasmoon), 16 hooks, **Graph Editor UI (React Flow)**, **Modal Editor** (CodeMirror Basic), Helpers |
| **2** | Enhanced: **LSP Integration** (CodeMirror + WebSocket), Visual builder enhancements, Plugin system |
| **3** | Future: Analytics, Advanced Branching, Scheduling |