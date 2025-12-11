## Goal
We need to implement a system that allows dynamic, runtime customization of authentication flows (e.g., sign-up validation, session enrichment) without code redeploys. This will be achieved by executing stored Lua scripts within a secure sandbox during specific better-auth lifecycle events.

## Recommended Tech Stack
* Engine: wasmoon (Lua 5.4 compiled to WebAssembly) to provide a high-performance, secure, and isolated execution environment.
* Storage: Drizzle ORM / SQLite to persist scripts, triggers (e.g., before_signup), and execution order.
* Integration: better-auth middleware/hooks to intercept requests and invoke the pipeline engine.

## Acceptance Criteria
* [ ] Database schema created to store script content, trigger events, and enabled status.
* [ ] Service layer implemented to spin up ephemeral Lua VMs and inject restricted context (user, request, headers).
* [ ] Integration with better-auth registration and login hooks to execute relevant scripts.
* [ ] Scripts must be able to successfully allow a request or block it with a custom reason.
* [ ] Basic error handling to ensure script failures (crashes/timeouts) fail securely (default deny) or gracefully (log only), depending on configuration.
