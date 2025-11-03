# Playwright E2E Plan – Admin Clients, Webhooks, Users

## Scope & Objectives
- Cover every route under `src/app/admin/clients`, `src/app/admin/webhooks`, and `src/app/admin/users` with production-like Playwright end-to-end tests.
- Validate happy paths, UX affordances (tables, filters, modals), validation errors, destructive flows, and integrations (email delivery, webhook callbacks).
- Ensure each test seeds the data it relies on and cleans up after itself so suites are deterministic and parallel-safe.
- Reuse shared fixtures for authentication, database access, mail capture, and webhook inspection to keep tests fast and isolated.

## Environment & Tooling
- **Runtime:** `docker-compose.yml` with `NODE_ENV=production`, `pnpm build` executed before the app container starts. Base URL `http://localhost:3000`.
- **Auth:** Use the seeded admin `admin@test.local` / `admin123` (created by `scripts/seed-admin-user.ts`) for all admin flows. Provide a Playwright fixture that signs in once, stores storageState for reuse across tests.
- **Database:** Connect to libSQL (`http://localhost:8080`) using `@libsql/client` within Playwright fixtures to insert/delete test records. Wrap each suite in `test.step`-level transactions where practical.
- **Mail capture:** Verify outbound emails via MailHog REST API (`http://localhost:8025/api/v2/messages`). Provide helper to poll for specific recipient/subject payloads.
- **Webhook inspection:** Use `webhook-tester` service (`http://localhost:8082/api/requests`) to assert test webhook callbacks are delivered.
- **Playwright config:**
  - Global timeout ≥ 90s to accommodate production bundle.
  - `use.baseURL = 'http://localhost:3000'`, `storageState` fixture for admin login.
  - Trace on failure (`trace: "retain-on-failure"`), video optional.
  - Tag tests by area (`@clients`, `@webhooks`, `@users`) for filtered runs.

### Docker Compose Test Harness
- **Boot sequence:** From the repo root run `NODE_ENV=production pnpm build` once, then `NODE_ENV=production docker compose up -d libsql redis qstash mailhog webhook-tester db-migrate app db-seed`. The `db-migrate` and `db-seed` jobs exit once schema + fixtures (admin user, OAuth clients) are ready.
- **Readiness checks:** Wait for `docker compose logs app` to show `Next.js production server…` and health check passing (`nc -z localhost 3000`). Redis exposes `6379`, MailHog UI at `http://localhost:8025`, SMTP on `1025`, webhook tester UI at `http://localhost:8082`, QStash local API on `http://localhost:8081`, libSQL HTTP endpoint on `http://localhost:8080`.
- **Environment overrides for tests:** Before starting the stack set `EMAIL_PROVIDER=smtp`, `SKIP_EMAIL_SENDING=false`, `SMTP_HOST=mailhog`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, and any other overrides (e.g., `PLAYWRIGHT=1`) in `.env.playwright` or exported shell vars so the `app` container picks them up. Ensure `QUEUE_TARGET_BASE_URL=http://app:3000` remains so QStash signature verification uses the container hostname.
- **Data hygiene:** Between suites use helper scripts or `docker compose restart db-seed` if you need to reseed defaults. For a clean slate run `docker compose down -v` (wipes libsql + redis volumes) followed by the boot sequence above.
- **Running tests:** With services up, execute Playwright on the host (`pnpm exec playwright test --config=playwright.config.ts`) or via `docker compose run --rm app pnpm exec playwright test` if you prefer containerised runs (mount repo to reuse build). All tests target the host’s `http://localhost:3000`.
- **Observability:** Tail service logs in separate terminals (`docker compose logs -f qstash`, `mailhog`, `app`) when debugging queue retries, SMTP deliveries, or webhook hits during E2E runs.

## Execution Phases

| Phase | Scope | Test IDs | Count | Target Outcome |
| --- | --- | --- | --- | --- |
| Phase 1 | Public authentication, onboarding, OIDC foundations | TC-001–TC-035 | 35 | Core auth journeys and discovery docs validated end-to-end |
| Phase 2 | Service APIs, queue workers, CORS/restricted endpoints | TC-036–TC-055 | 20 | Backend surfaces (API key exchange, queues, smoke endpoints) proven stable |
| Phase 3 | Security hardening rechecks & abuse scenarios | TC-056–TC-079 | 24 | Guardrails (sessions, secrets, origins, rate limits) confirmed |
| Phase 4 | Admin Clients area UI + access/API key management | TC-080–TC-118 | 39 | Client CRUD, access policies, and API key UX covered |
| Phase 5 | Admin Webhooks area UI + delivery lifecycle | TC-119–TC-138 | 20 | Webhook dashboards, creation, secret rotation, delivery logs verified |
| Phase 6 | Admin Users area UI + account management | TC-139–TC-160 | 22 | User directory, creation, detail tabs, session/security actions validated |

Total planned tests: **160**

## Test Case Tracker

Use the tables below to record implementation status (`TODO`, `In Progress`, `Done`, etc.). Descriptions map directly to the detailed scenarios documented later—search by the test heading text to jump to full preparation/step/assertion details.
All tests are true pass/fail gates: if a scenario currently fails, treat it as a product bug and fix it rather than accepting the failure.

### Public Authentication & Reset (Phase 1 • TC-001–TC-014)

| ID | Description | Phase | Status |
| --- | --- | --- | --- |
| [TC-001](#tc-001) | `/sign-in` – Admin login redirects to dashboard | Phase 1 | TODO |
| [TC-002](#tc-002) | `/sign-in` – Non-admin blocked without OIDC context | Phase 1 | TODO |
| [TC-003](#tc-003) | `/sign-in` – OIDC authorize query preserved | Phase 1 | TODO |
| [TC-004](#tc-004) | `/sign-in` – Callback URL hidden field honoured | Phase 1 | TODO |
| [TC-005](#tc-005) | `/sign-in` – Forbidden error toast via query | Phase 1 | TODO |
| [TC-006](#tc-006) | `/sign-in` – Authenticated admin auto-redirect | Phase 1 | TODO |
| [TC-007](#tc-007) | Email verification – Sign-up triggers verification mail | Phase 1 | TODO |
| [TC-008](#tc-008) | Email verification – Verification link activates account | Phase 1 | TODO |
| [TC-009](#tc-009) | Email verification – Auto sign-in after verification | Phase 1 | TODO |
| [TC-010](#tc-010) | `/reset-password` – Missing token renders invalid link card | Phase 1 | TODO |
| [TC-011](#tc-011) | `/reset-password` – Invalid token query toast | Phase 1 | TODO |
| [TC-012](#tc-012) | `/reset-password` – Client-side validation errors | Phase 1 | TODO |
| [TC-013](#tc-013) | `/reset-password` – Successful reset redirects to sign-in | Phase 1 | TODO |
| [TC-014](#tc-014) | `/reset-password` – Missing token prevents submission | Phase 1 | TODO |

### OAuth & Protocol Flows (Phase 1 • TC-015–TC-035)

| ID | Description | Phase | Status |
| --- | --- | --- | --- |
| [TC-015](#tc-015) | OIDC discovery document accurate | Phase 1 | TODO |
| [TC-016](#tc-016) | JWKS endpoint serves active key | Phase 1 | TODO |
| [TC-017](#tc-017) | Confidential client – Auth code exchange with `client_secret_basic` | Phase 1 | TODO |
| [TC-018](#tc-018) | Confidential client – Authorization requires trusted redirect | Phase 1 | TODO |
| [TC-019](#tc-019) | PKCE flow success (public SPA client) | Phase 1 | TODO |
| [TC-020](#tc-020) | PKCE flow rejects missing `code_verifier` | Phase 1 | TODO |
| [TC-021](#tc-021) | Restricted OAuth client denies unauthorized user | Phase 1 | TODO |
| [TC-022](#tc-022) | Assigned user gains access to restricted client | Phase 1 | TODO |
| [TC-023](#tc-023) | Preview redirect registration persists dynamic URIs | Phase 1 | TODO |
| [TC-024](#tc-024) | Access token claims include issuer/audience/scope | Phase 1 | TODO |
| [TC-025](#tc-025) | Automatic JWT audience selection honoured | Phase 1 | TODO |
| [TC-026](#tc-026) | JWKS rotation endpoint rotates keys | Phase 1 | TODO |
| [TC-027](#tc-027) | Unauthorized JWKS rotation blocked | Phase 1 | TODO |
| [TC-028](#tc-028) | OAuth proxy config exposes URLs | Phase 1 | TODO |
| [TC-029](#tc-029) | OAuth proxy rewrites relative authorize URL | Phase 1 | TODO |
| [TC-030](#tc-030) | Username plugin – Username sign-in via API | Phase 1 | TODO |
| [TC-031](#tc-031) | Username plugin – Unknown username rejected | Phase 1 | TODO |
| [TC-032](#tc-032) | Admin plugin – Admin-only route guard | Phase 1 | TODO |
| [TC-033](#tc-033) | API key plugin – Create & verify API key | Phase 1 | TODO |
| [TC-034](#tc-034) | API key plugin – Metadata update & revoke | Phase 1 | TODO |
| [TC-035](#tc-035) | API key plugin – Rate limit disabled by default | Phase 1 | TODO |

### Service APIs & Queues (Phase 2 • TC-036–TC-055)

| ID | Description | Phase | Status |
| --- | --- | --- | --- |
| [TC-036](#tc-036) | API key exchange – Successful JWT issuance | Phase 2 | TODO |
| [TC-037](#tc-037) | API key exchange – Missing API key rejected | Phase 2 | TODO |
| [TC-038](#tc-038) | API key exchange – Invalid API key denied | Phase 2 | TODO |
| [TC-039](#tc-039) | API key exchange – Permission enforcement | Phase 2 | TODO |
| [TC-040](#tc-040) | API key exchange – JWKS missing returns 500 | Phase 2 | TODO |
| [TC-041](#tc-041) | API key exchange – Private key decrypt/import errors handled | Phase 2 | TODO |
| [TC-042](#tc-042) | API key exchange – JWT header uses latest `kid` | Phase 2 | TODO |
| [TC-043](#tc-043) | Webhook delivery worker – Valid QStash signature processes job | Phase 2 | TODO |
| [TC-044](#tc-044) | Webhook delivery worker – Missing signature rejected | Phase 2 | TODO |
| [TC-045](#tc-045) | Webhook delivery worker – Invalid signature returns 401 | Phase 2 | TODO |
| [TC-046](#tc-046) | Webhook delivery worker – Unknown delivery returns 404 | Phase 2 | TODO |
| [TC-047](#tc-047) | Webhook delivery worker – Delivery failure triggers retry | Phase 2 | TODO |
| [TC-048](#tc-048) | Webhook delivery worker – Verification uses queue base URL | Phase 2 | TODO |
| [TC-049](#tc-049) | Test utility `/api/test/trigger-user-update` requires admin session | Phase 2 | TODO |
| [TC-050](#tc-050) | Test utility – Missing `userId` validation | Phase 2 | TODO |
| [TC-051](#tc-051) | Test utility – Successful update returns metadata | Phase 2 | TODO |
| [TC-052](#tc-052) | Test utility – Unknown user returns 404 | Phase 2 | TODO |
| [TC-053](#tc-053) | Auth service CORS preflight allowed for trusted origin | Phase 2 | TODO |
| [TC-054](#tc-054) | Auth service CORS blocks untrusted origin | Phase 2 | TODO |
| [TC-055](#tc-055) | Restricted signup requires secret header | Phase 2 | TODO |

### Security Hardening (Phase 3 • TC-056–TC-079)

| ID | Description | Phase | Status |
| --- | --- | --- | --- |
| [TC-056](#tc-056) | Session cookie attributes hardened | Phase 3 | TODO |
| [TC-057](#tc-057) | Session invalidation on logout | Phase 3 | TODO |
| [TC-058](#tc-058) | Brute-force protection throttles repeated sign-ins | Phase 3 | TODO |
| [TC-059](#tc-059) | Cross-origin POST to admin endpoint blocked by SameSite/CORS | Phase 3 | TODO |
| [TC-060](#tc-060) | OAuth authorization errors sanitized (no sensitive details) | Phase 3 | TODO |
| [TC-061](#tc-061) | API key listing/exchange responses redact secret material | Phase 3 | TODO |
| [TC-062](#tc-062) | Tampered JWT is rejected by token introspection | Phase 3 | TODO |
| [TC-063](#tc-063) | Reject invalid redirect URIs (injection guard) | Phase 3 | TODO |
| [TC-064](#tc-064) | Webhook secret retrieval requires endpoint ownership | Phase 3 | TODO |
| [TC-065](#tc-065) | Permission builder rejects invalid names | Phase 3 | TODO |
| [TC-066](#tc-066) | Secrets not leaked in UI | Phase 3 | TODO |
| [TC-067](#tc-067) | Secret regeneration invalidates old credentials | Phase 3 | TODO |
| [TC-068](#tc-068) | Webhook secret copy requires explicit action | Phase 3 | TODO |
| [TC-069](#tc-069) | JWKS rotation schedule enforced | Phase 3 | TODO |
| [TC-070](#tc-070) | Token fails after JWKS pruning | Phase 3 | TODO |
| [TC-071](#tc-071) | QStash signature required for non-POST methods | Phase 3 | TODO |
| [TC-072](#tc-072) | QStash replay attack prevention | Phase 3 | TODO |
| [TC-073](#tc-073) | Trusted origin wildcard handling | Phase 3 | TODO |
| [TC-074](#tc-074) | CORS responses include `Vary: Origin` for cache safety | Phase 3 | TODO |
| [TC-075](#tc-075) | API key exchange rate limiting (if applicable) | Phase 3 | TODO |
| [TC-076](#tc-076) | Webhook delivery retry cap enforced | Phase 3 | TODO |
| [TC-077](#tc-077) | Restricted signup header case-sensitivity | Phase 3 | TODO |
| [TC-078](#tc-078) | Clipboard copy sanitises output | Phase 3 | TODO |
| [TC-079](#tc-079) | Email templates avoid injection | Phase 3 | TODO |

### Admin Clients Area (Phase 4 • TC-080–TC-118)

| ID | Description | Phase | Status |
| --- | --- | --- | --- |
| [TC-080](#tc-080) | `/admin/clients` – Table renders trusted & dynamic clients | Phase 4 | TODO |
| [TC-081](#tc-081) | `/admin/clients` – Search filters by name/ID | Phase 4 | TODO |
| [TC-082](#tc-082) | `/admin/clients` – Filter by client type | Phase 4 | TODO |
| [TC-083](#tc-083) | `/admin/clients` – Pagination controls | Phase 4 | TODO |
| [TC-084](#tc-084) | `/admin/clients` – Empty state message | Phase 4 | TODO |
| [TC-085](#tc-085) | `/admin/clients` – Row navigation to detail | Phase 4 | TODO |
| [TC-086](#tc-086) | Client register – Required field validation | Phase 4 | TODO |
| [TC-087](#tc-087) | Client register – URL list builder hidden payload | Phase 4 | TODO |
| [TC-088](#tc-088) | Client register – Create confidential trusted client | Phase 4 | TODO |
| [TC-089](#tc-089) | Client register – Grant type validation | Phase 4 | TODO |
| [TC-090](#tc-090) | Client register – Cancel returns to list | Phase 4 | TODO |
| [TC-091](#tc-091) | Client register – Invalid redirect URL validation | Phase 4 | TODO |
| [TC-092](#tc-092) | Client detail – Overview renders metadata & stats | Phase 4 | TODO |
| [TC-093](#tc-093) | Client detail – Edit & save metadata | Phase 4 | TODO |
| [TC-094](#tc-094) | Client detail – Cancel edit reverts state | Phase 4 | TODO |
| [TC-095](#tc-095) | Client detail – Blank name validation error | Phase 4 | TODO |
| [TC-096](#tc-096) | Client detail – Disable & re-enable client | Phase 4 | TODO |
| [TC-097](#tc-097) | Client detail – Rotate secret flow | Phase 4 | TODO |
| [TC-098](#tc-098) | Client detail – Delete client | Phase 4 | TODO |
| [TC-099](#tc-099) | Client detail – Public client omits secret actions | Phase 4 | TODO |
| [TC-100](#tc-100) | Client access – Toggle to restricted policy | Phase 4 | TODO |
| [TC-101](#tc-101) | Client access – Toggle back to open access | Phase 4 | TODO |
| [TC-102](#tc-102) | Client access – Save allowed resources | Phase 4 | TODO |
| [TC-103](#tc-103) | Client access – Invalid resource name blocked | Phase 4 | TODO |
| [TC-104](#tc-104) | Client access – Prevent removing resources in use | Phase 4 | TODO |
| [TC-105](#tc-105) | Client access – Assign user via picker | Phase 4 | TODO |
| [TC-106](#tc-106) | Client access – Prevent duplicate assignment | Phase 4 | TODO |
| [TC-107](#tc-107) | Client access – Edit user access levels | Phase 4 | TODO |
| [TC-108](#tc-108) | Client access – Remove user access | Phase 4 | TODO |
| [TC-109](#tc-109) | Client access – Create user group | Phase 4 | TODO |
| [TC-110](#tc-110) | Client access – Loading skeleton before data | Phase 4 | TODO |
| [TC-111](#tc-111) | Client API keys – API keys disabled message | Phase 4 | TODO |
| [TC-112](#tc-112) | Client API keys – Default permission selection | Phase 4 | TODO |
| [TC-113](#tc-113) | Client API keys – Select all shortcut | Phase 4 | TODO |
| [TC-114](#tc-114) | Client API keys – Create key with expiration & perms | Phase 4 | TODO |
| [TC-115](#tc-115) | Client API keys – Secret modal dismissal | Phase 4 | TODO |
| [TC-116](#tc-116) | Client API keys – Edit permissions | Phase 4 | TODO |
| [TC-117](#tc-117) | Client API keys – Revoke key | Phase 4 | TODO |
| [TC-118](#tc-118) | Client API keys – Loading skeleton | Phase 4 | TODO |

### Admin Webhooks Area (Phase 5 • TC-119–TC-138)

| ID | Description | Phase | Status |
| --- | --- | --- | --- |
| [TC-119](#tc-119) | `/admin/webhooks` – Metrics card displays stats | Phase 5 | TODO |
| [TC-120](#tc-120) | `/admin/webhooks` – Table renders attributes | Phase 5 | TODO |
| [TC-121](#tc-121) | `/admin/webhooks` – Search by name/URL | Phase 5 | TODO |
| [TC-122](#tc-122) | `/admin/webhooks` – Filter by status + event type | Phase 5 | TODO |
| [TC-123](#tc-123) | `/admin/webhooks` – Pagination controls | Phase 5 | TODO |
| [TC-124](#tc-124) | `/admin/webhooks` – Actions dropdown view details | Phase 5 | TODO |
| [TC-125](#tc-125) | `/admin/webhooks` – Actions dropdown toggle status | Phase 5 | TODO |
| [TC-126](#tc-126) | `/admin/webhooks` – Actions dropdown trigger test event | Phase 5 | TODO |
| [TC-127](#tc-127) | `/admin/webhooks` – Actions dropdown delete webhook | Phase 5 | TODO |
| [TC-128](#tc-128) | Webhook create – Required validation errors | Phase 5 | TODO |
| [TC-129](#tc-129) | Webhook create – Advanced options persisted | Phase 5 | TODO |
| [TC-130](#tc-130) | Webhook create – Invalid URL rejected | Phase 5 | TODO |
| [TC-131](#tc-131) | Webhook create – Success screen copy button | Phase 5 | TODO |
| [TC-132](#tc-132) | Webhook detail – Settings tab loads persisted values | Phase 5 | TODO |
| [TC-133](#tc-133) | Webhook detail – Update webhook settings | Phase 5 | TODO |
| [TC-134](#tc-134) | Webhook detail – Regenerate secret | Phase 5 | TODO |
| [TC-135](#tc-135) | Webhook detail – Delete webhook | Phase 5 | TODO |
| [TC-136](#tc-136) | Webhook detail – Delivery logs render table | Phase 5 | TODO |
| [TC-137](#tc-137) | Webhook detail – Empty delivery state | Phase 5 | TODO |
| [TC-138](#tc-138) | Webhook detail – Test webhook button | Phase 5 | TODO |

### Admin Users Area (Phase 6 • TC-139–TC-160)

| ID | Description | Phase | Status |
| --- | --- | --- | --- |
| [TC-139](#tc-139) | `/admin/users` – Table renders email/status/providers | Phase 6 | TODO |
| [TC-140](#tc-140) | `/admin/users` – Search by email/name | Phase 6 | TODO |
| [TC-141](#tc-141) | `/admin/users` – Filter by verification status | Phase 6 | TODO |
| [TC-142](#tc-142) | `/admin/users` – Pagination | Phase 6 | TODO |
| [TC-143](#tc-143) | `/admin/users` – Empty state | Phase 6 | TODO |
| [TC-144](#tc-144) | `/admin/users` – Row navigation to detail | Phase 6 | TODO |
| [TC-145](#tc-145) | User create – Required validation | Phase 6 | TODO |
| [TC-146](#tc-146) | User create – Create user with password | Phase 6 | TODO |
| [TC-147](#tc-147) | User create – Invite flow clears password field | Phase 6 | TODO |
| [TC-148](#tc-148) | User create – Send invite triggers email | Phase 6 | TODO |
| [TC-149](#tc-149) | User create – Cancel returns to list | Phase 6 | TODO |
| [TC-150](#tc-150) | User detail – Profile tab renders data | Phase 6 | TODO |
| [TC-151](#tc-151) | User detail – Edit profile fields | Phase 6 | TODO |
| [TC-152](#tc-152) | User detail – Toggle email verification | Phase 6 | TODO |
| [TC-153](#tc-153) | User detail – Force logout all sessions | Phase 6 | TODO |
| [TC-154](#tc-154) | User detail – Linked accounts unlink | Phase 6 | TODO |
| [TC-155](#tc-155) | User detail – Revoke session | Phase 6 | TODO |
| [TC-156](#tc-156) | User detail – Set password modal validation | Phase 6 | TODO |
| [TC-157](#tc-157) | User detail – Send password reset email | Phase 6 | TODO |
| [TC-158](#tc-158) | User detail – Sessions tab empty state | Phase 6 | TODO |
| [TC-159](#tc-159) | User detail – Activity tab placeholder | Phase 6 | TODO |
| [TC-160](#tc-160) | User detail – Error messaging on failed update | Phase 6 | TODO |

### Parallel Execution & Performance Strategy
- **Spec distribution:** Keep feature areas in separate spec files (table below) and enable `fullyParallel: true` so workers execute them concurrently. Default to `workers: Math.min(os.cpus().length, 6)` in CI; locally allow `npx playwright test --workers=4`.
- **Project-based sharding:** Define Playwright `projects` for each admin area (clients/webhooks/users) that simply set `grep`/`grepInvert`. CI can execute each project in a dedicated job to cap runtime.
- **Session reuse:** Create a one-time login in `global-setup.ts` that saves `storageState` to disk. Each worker loads the state to avoid repeating the admin login flow.
- **Fixture caching:** Open shared resources (DB connection pools, webhook/mail helpers) in worker-scoped fixtures to amortize setup. Ensure factories generate unique records per test to avoid collisions across workers.
- **Serial opt-in:** Restrict `test.describe.configure({ mode: "serial" })` to flows that mutate global constraints (e.g., API key default permission edits). Everything else should run in parallel.
- **Timeout & retry policy:** Keep default timeouts modest (30s) and configure `retries: 1` in CI only. Use Playwright traces on failure for fast triage instead of blanket retry loops that slow the suite.
- **Runtime monitoring:** Have CI upload Playwright report JSON; watch for suites exceeding agreed SLA (e.g., >12 minutes) and adjust sharding or worker count accordingly.

### Mail Delivery Adapter Migration Plan
- **Problem:** Current mailer shortcuts when `SKIP_EMAIL_SENDING=true`, so MailHog never receives messages. Playwright needs real deliveries to assert invite/reset flows.
- **Adapter abstraction:**
  1. Introduce `EmailProvider` interface (`send({ to, subject, html }): Promise<{ success; id?; error? }>`).
  2. Keep existing Resend logic behind `ResendEmailProvider`.
  3. Add `SmtpEmailProvider` using `nodemailer` (SMTP host `mailhog`, port `1025`, `secure=false`).
  4. Export `getEmailProvider()` that selects provider based on `EMAIL_PROVIDER` env var (`resend` default, `smtp` for tests/local).
- **Config changes:**
  - Extend `.env.example`, docker-compose, and CI secrets with `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional `SMTP_USER/PASS`.
  - For test stack, set `EMAIL_PROVIDER=smtp` and either remove or set `SKIP_EMAIL_SENDING=false`.
  - Update `sendVerificationEmail` / `sendPasswordResetEmail` to call provider instead of Resend directly; keep SKIP guard as fallback.
- **Verification workflow:**
  - Add small script `pnpm mail:smoke-test` that sends a sample email through the provider and asserts MailHog receives it (using REST API).
  - Enhance Playwright `mailhog` helper with `reset()`, `findLatest({ to, subjectContains })`, and `assertContainsLink()` utilities.
- **Production safety:** Retain Resend as default path and log warning if `EMAIL_PROVIDER=smtp` in production. Provide override to disable email sending entirely for ephemeral dev environments.

### Migration Blueprint
1. **Refactor email provider layer**
   - Implement abstraction + SMTP adapter.
   - Update env files and docker-compose overrides; document new variables.
   - Smoke test MailHog integration locally.
2. **Upgrade Playwright infrastructure**
   - Add `global-setup.ts`, shared fixtures, data factories, and helper utilities.
   - Configure Playwright projects/tags, parallel workers, retries, and reporting.
   - Create npm scripts (`test:e2e`, `test:e2e:clients`, etc.) to run subsets; adjust CI pipeline to shard by project if runtime > target.
3. **Incremental spec rollout**
   - Start with one surface (e.g., users) to validate fixtures + mailer.
   - Expand to clients + webhooks; mark serial suites sparingly; monitor runtime.
   - Once coverage stable, enforce gating check (CI must pass Playwright suite).
4. **Ongoing maintenance**
   - Track flaky tests via Playwright report; quarantine with `test.fixme` if needed.
   - Review runtime metrics quarterly; tweak workers/sharding accordingly.
   - Keep MailHog/webhook-tester cleanup helpers up-to-date to avoid state bleed.

## Test Data & Cleanup Strategy
- **Factories:** Implement lightweight data factories in `tests/factories/*.ts` that talk to the database:
  - `createUser`, `createUserWithSessions`, `createOAuthClient`, `createWebhookEndpoint`, `createWebhookDeliveries`, `createClientApiKey`, `createUserGroup`, etc.
  - Each factory returns identifiers and registers cleanup callbacks (delete rows) via a Playwright fixture (`test.step` + `test.info().attach(...)` or `test.afterEach` array).
- **Unique identifiers:** Use timestamp-based suffixes to avoid collisions (e.g., `Test Client ${Date.now()}`).
- **Cleanup:** On successful tests delete inserted records; on failure rely on test-specific rollback to avoid leaking state. Provide helper to purge dependent tables (e.g., `oauth_access_token`, `webhook_delivery`) before removing parents.
- **Mail/Webhook reset:** Before email/webhook tests, call MailHog `DELETE /api/v1/messages` and webhook-tester `DELETE /api/requests` to start from a clean slate.

## Test Suite Structure
| Suite | File suggestion | Notes |
| --- | --- | --- |
| Admin clients list & register | `tests/e2e/admin-clients.spec.ts` | Covers `/admin/clients`, `/admin/clients/register` |
| Client detail – overview | `tests/e2e/admin-client-overview.spec.ts` | `/admin/clients/:id` |
| Client access control | `tests/e2e/admin-client-access.spec.ts` | `/admin/clients/:id/access` |
| Client API keys | `tests/e2e/admin-client-api-keys.spec.ts` | `/admin/clients/:id/api-keys` |
| Webhooks list & create | `tests/e2e/admin-webhooks.spec.ts` | `/admin/webhooks`, `/admin/webhooks/create` |
| Webhook detail & deliveries | `tests/e2e/admin-webhook-detail.spec.ts` | `/admin/webhooks/:id` |
| Users list & create | `tests/e2e/admin-users.spec.ts` | `/admin/users`, `/admin/users/create` |
| User detail | `tests/e2e/admin-user-detail.spec.ts` | `/admin/users/:id` |

| Additional suite | File suggestion | Notes |
| --- | --- | --- |
| Public auth entry & sign-in | `tests/e2e/public-auth.spec.ts` | Covers `/sign-in` admin + OAuth entry, forbidden states |
| Password reset | `tests/e2e/reset-password.spec.ts` | `/reset-password` success/error/invalid token states |
| OAuth authorize UI handoff | `tests/e2e/oauth-authorize.spec.ts` | Interactive consent redirect flows incl. restricted clients |
| Email verification pipeline | `tests/e2e/email-verification.spec.ts` | Sign-up invite, MailHog link, post-verification redirect |

### Integration / Protocol Suites
| Suite | File suggestion | Notes |
| --- | --- | --- |
| OAuth token & JWT validation | `tests/api/oauth-tokens.spec.ts` | Confidential + PKCE code exchanges, claim assertions |
| JWKS rotation & pruning | `tests/api/jwks-rotation.spec.ts` | `/api/internal/rotate-jwks`, retention enforcement |
| Auth service CORS & restricted paths | `tests/api/auth-cors.spec.ts` | `OPTIONS`/`POST` preflight, restricted signup guard |
| API key plugin lifecycle | `tests/api/api-key-plugin.spec.ts` | Programmatic create/verify/list/delete via Better Auth client |
| Username & admin plugin checks | `tests/api/auth-plugins.spec.ts` | Username login, admin-only endpoints, proxy metadata |

Each file should:
- Import the shared `adminTest` fixture (extends Playwright `test`) that provides `page`, `db`, `mailhog`, `webhookInspector`, and `cleanup`.
- Seed prerequisite data in `test.beforeEach(async ({ db, cleanup }) => { ... })`.
- Use `await cleanup.add(async () => ...)` to register teardown callbacks.

## Shared Fixtures & Helpers
- **`adminTest` fixture:** Signs in via UI once (navigate `/auth/sign-in`, submit admin creds), saves `storageState.json`. Expose `login()` helper to re-auth if state invalid.
- **`db` helper:** Thin wrapper exposing typed SQL helpers for user, client, webhook tables. Provide convenience methods (e.g., `db.insertOAuthClient({ ... })`).
- **`mailhog` helper:** `mailhog.assertEmail({ to, subjectContains, timeout })`.
- **`webhookInspector` helper:** Waits for request to appear with matching `path`/`body`.
- **`expectToast` helper:** Wait for Sonner toast by role `status` or `[data-sonner-toast]`.
- **`withRetry` utility:** Use for polling asynchronous background updates (e.g., webhook status updates).

## Public Authentication & Onboarding

### `/sign-in` – Admin & OAuth Entry Point

<a id="tc-001"></a>
###### TC-001 — Test: Admin login redirects to dashboard
- **Preparation:** Ensure admin credentials seeded.
- **Steps:** Visit `/sign-in`, submit admin email/password.
- **Assertions:** Redirect to `/admin`; toast “You are signed in”; session cookie present.


<a id="tc-002"></a>
###### TC-002 — Test: Non-admin blocked without OIDC context
- **Preparation:** Seed regular user without admin role.
- **Steps:** Submit credentials without authorize/callback params.
- **Assertions:** Toast error “Access denied…”; request to `auth.api.signOut` observed (network); page stays on sign-in.


<a id="tc-003"></a>
###### TC-003 — Test: OIDC authorize query preserved
- **Preparation:** Craft authorize params (`response_type=code&client_id=...`) for payload SPA client.
- **Steps:** Navigate to `/sign-in?response_type=code&...`, submit user credentials.
- **Assertions:** Browser redirected to `/api/auth/oauth2/authorize?…` with original query; hidden `authorizeQuery` field recorded entire query string.


<a id="tc-004"></a>
###### TC-004 — Test: Callback URL hidden field
- **Preparation:** Append `callback_url=https://example.com/app`.
- **Steps:** Submit admin credentials.
- **Assertions:** Redirect goes to given callback; no toast error.


<a id="tc-005"></a>
###### TC-005 — Test: Forbidden error toast via query
- **Preparation:** Load `/sign-in?error=forbidden`.
- **Steps:** Observe initial render.
- **Assertions:** Toast error “Access denied…” pops once; form remains functional.


<a id="tc-006"></a>
###### TC-006 — Test: Authenticated admin auto-redirect
- **Preparation:** Reuse signed-in storage state.
- **Steps:** Navigate to `/sign-in`.
- **Assertions:** Server responds with redirect to `/admin` before render (Next.js redirect).

### Email Verification Pipeline


<a id="tc-007"></a>
###### TC-007 — Test: Sign-up triggers verification email
- **Preparation:** Enable SMTP adapter (MailHog) and ensure `SKIP_EMAIL_SENDING=false`.
- **Steps:** Call `auth.api.signUpEmail` via helper factory; poll MailHog for message.
- **Assertions:** Email delivered with verification link containing token; payload references correct callback host.


<a id="tc-008"></a>
###### TC-008 — Test: Verification link activates account
- **Preparation:** Extract verification URL from MailHog.
- **Steps:** Visit link in Playwright; follow redirect(s).
- **Assertions:** Final page indicates success; new session cookie issued; user’s `email_verified` flag true in DB.


<a id="tc-009"></a>
###### TC-009 — Test: Auto sign-in after verification
- **Preparation:** Use same verification link.
- **Steps:** After visiting link, navigate to `/admin`.
- **Assertions:** Access granted without re-login (due to `autoSignInAfterVerification`).

### `/reset-password` – Token Handling


<a id="tc-010"></a>
###### TC-010 — Test: Missing token renders invalid link card
- **Preparation:** Visit `/reset-password` with no query.
- **Steps:** Observe page.
- **Assertions:** Error card shown; submit button absent.


<a id="tc-011"></a>
###### TC-011 — Test: Invalid token query toast
- **Preparation:** Visit `/reset-password?error=INVALID_TOKEN`.
- **Steps:** Wait for page load.
- **Assertions:** Toast “Invalid reset link” fired; inputs disabled.


<a id="tc-012"></a>
###### TC-012 — Test: Client-side validation errors
- **Preparation:** Visit with `?token=dummy`.
- **Steps:** Submit mismatched passwords.
- **Assertions:** Toast “Passwords don't match” and no server call.


<a id="tc-013"></a>
###### TC-013 — Test: Successful reset redirects
- **Preparation:** Generate valid reset token via `auth.api.createPasswordReset`.
- **Steps:** Fill matching passwords (>=8 chars), submit.
- **Assertions:** Toast success, success card renders, after 2s redirected to `/sign-in`; DB password hash updated.


<a id="tc-014"></a>
###### TC-014 — Test: Missing token prevents submission
- **Preparation:** Remove `token` query but keep form (simulate by tampering).
- **Steps:** Attempt submit.
- **Assertions:** Toast “Missing reset token”; no network call.

## OAuth, PKCE & Token Validation

### Discovery & Metadata Endpoints


<a id="tc-015"></a>
###### TC-015 — Test: OIDC discovery document accurate
- **Preparation:** None.
- **Steps:** Fetch `/.well-known/openid-configuration`.
- **Assertions:** `issuer` equals `env.JWT_ISSUER`; endpoints match `/api/auth/oauth2/authorize`, `/api/auth/token`; includes PKCE methods and JWKS URI.


<a id="tc-016"></a>
###### TC-016 — Test: JWKS endpoint serves active key
- **Preparation:** Ensure at least one key seeded (docker compose does).
- **Steps:** Fetch JWKS URI; parse JSON.
- **Assertions:** Contains at least one key with `kid`, `kty=RSA`; certificate decodes.

### Confidential Client Authorization Code Flow


<a id="tc-017"></a>
###### TC-017 — Test: Auth code exchange with client_secret_basic
- **Preparation:** Seed admin session cookie; identify payload admin client ID/secret.
- **Steps:** 
  1. Send GET `/api/auth/oauth2/authorize` with `client_id` + redirect + `response_type=code` + `scope=openid profile email`.
  2. Follow redirect (should prompt login if not using cookie); finalize to callback with `code`.
  3. POST to `/api/auth/token` using Basic auth header + code.
- **Assertions:** Response includes `access_token`, `id_token`, `refresh_token`; tokens are JWTs signed by JWKS; `aud` matches `payload-admin`; `token_type` “Bearer”.


<a id="tc-018"></a>
###### TC-018 — Test: Authorization requires trusted redirect
- **Preparation:** Use same client but tamper `redirect_uri`.
- **Steps:** Attempt authorize with unregistered redirect.
- **Assertions:** Authorization endpoint rejects with error page or `invalid_request`.

### PKCE (Public SPA Client)


<a id="tc-019"></a>
###### TC-019 — Test: PKCE flow success
- **Preparation:** Create user with verified email; generate `code_verifier` / `code_challenge`.
- **Steps:** 
  1. Visit `/api/auth/oauth2/authorize` with SPA client ID, `code_challenge`, `code_challenge_method=S256`.
  2. Complete login via `/sign-in` handoff.
  3. Exchange code by POST to `/api/auth/token` with `code_verifier`.
- **Assertions:** Token response lacks client secret requirement; `token_endpoint_auth_method` “none”; `access_token` audience matches SPA id (or default).


<a id="tc-020"></a>
###### TC-020 — Test: Missing code_verifier rejected
- **Preparation:** Acquire code via PKCE authorize but omit `code_verifier` on token exchange.
- **Steps:** POST to `/api/auth/token` without `code_verifier`.
- **Assertions:** Response `400` with `invalid_grant`.

### Access Policy & Dynamic Redirects


<a id="tc-021"></a>
###### TC-021 — Test: Restricted client denies unauthorized user
- **Preparation:** Mark client metadata `accessPolicy="restricted"`; ensure user has no access record.
- **Steps:** Attempt authorize as that user.
- **Assertions:** Redirect to `redirect_uri` with `error=access_denied` and `error_description` from `checkOAuthClientAccess`.


<a id="tc-022"></a>
###### TC-022 — Test: Assigned user gains access
- **Preparation:** Assign user via metadata repository factory.
- **Steps:** Repeat authorize.
- **Assertions:** Flow succeeds; no error.


<a id="tc-023"></a>
###### TC-023 — Test: Preview redirect registration
- **Preparation:** Choose preview URL matching `*.quanghuy.dev`.
- **Steps:** Authorize with `redirect_uri` preview domain.
- **Assertions:** After flow, confirm client metadata includes new redirect (via DB) and second authorize allows same URI without re-registration.

### JWT Plugin & JWKS Rotation


<a id="tc-024"></a>
###### TC-024 — Test: Access token claims
- **Preparation:** Complete any successful token exchange.
- **Steps:** Decode access token (using `jose`); verify signature against JWKS.
- **Assertions:** Claims include `iss`, `aud`, `sub`, `exp`, `iat`; `aud` in `env.JWT_AUDIENCE`; `scope` contains requested scopes.


<a id="tc-025"></a>
###### TC-025 — Test: Automatic JWT audience selection
- **Preparation:** Exchange token with `audience=test-client`.
- **Steps:** Add `audience` param to authorize/token.
- **Assertions:** `aud` claim equals `test-client`; plugin respects configured list.


<a id="tc-026"></a>
###### TC-026 — Test: JWKS rotation endpoint
- **Preparation:** Record current JWKS `kid`; ensure `CRON_SECRET`.
- **Steps:** POST `/api/internal/rotate-jwks` with correct headers.
- **Assertions:** Response `rotated=true`; new `kid` differs; stale keys older than retention removed.


<a id="tc-027"></a>
###### TC-027 — Test: Unauthorized rotation blocked
- **Preparation:** None.
- **Steps:** Call endpoint without headers.
- **Assertions:** 401 response; no new keys added.

### OAuth Proxy Metadata


<a id="tc-028"></a>
###### TC-028 — Test: OAuth proxy config exposes URLs
- **Preparation:** Determine plugin output path (e.g., `/api/auth/oauth-proxy` if applicable).
- **Steps:** Fetch proxy metadata endpoint (per plugin docs).
- **Assertions:** JSON lists `productionURL` and `currentURL` matching env; ensures load balancer compatibility.


<a id="tc-029"></a>
###### TC-029 — Test: Proxy rewrites relative authorize URL
- **Preparation:** Use `fetch` with custom `X-Forwarded-Host` to mimic proxy.
- **Steps:** Request authorize endpoint with that header.
- **Assertions:** Redirect uses `productionURL` host (verifies plugin handshake).

## Better Auth Plugin Integration Tests

### Username Plugin


<a id="tc-030"></a>
###### TC-030 — Test: Username sign-in via API
- **Preparation:** Create user with username + password.
- **Steps:** Call `auth.api.signInUsername` through helper.
- **Assertions:** Returns session with matching user; cookie set.


<a id="tc-031"></a>
###### TC-031 — Test: Username sign-in rejects unknown user
- **Preparation:** None.
- **Steps:** Attempt sign-in with nonexistent username.
- **Assertions:** Error response with `INVALID_CREDENTIALS`.

### Admin Plugin


<a id="tc-032"></a>
###### TC-032 — Test: Admin-only route guard
- **Preparation:** Acquire session for admin and regular user.
- **Steps:** Call an admin-only Better Auth endpoint (e.g., `GET /api/auth/admin/users`) with each session or use the SDK equivalent.
- **Assertions:** Admin succeeds; regular user receives `FORBIDDEN`.

### API Key Plugin


<a id="tc-033"></a>
###### TC-033 — Test: Create & verify API key via client
- **Preparation:** Use `authClient` in tests.
- **Steps:** Call `auth.api.createApiKey` with permissions; capture returned secret.
- **Assertions:** Secret matches `isValidApiKeyFormat`; `verifyApiKey` returns success; DB record stored with metadata.


<a id="tc-034"></a>
###### TC-034 — Test: API key revocation and metadata
- **Preparation:** Use key from previous test.
- **Steps:** Update metadata via `auth.api.updateApiKey`; then delete.
- **Assertions:** Metadata persisted, `listApiKeys` reflects update, deletion removes record.


<a id="tc-035"></a>
###### TC-035 — Test: Rate limit disabled by default
- **Preparation:** None.
- **Steps:** Inspect created key record.
- **Assertions:** `rate_limit_enabled=false` due to plugin config.

## API Key Exchange JWT Issuance (`/api/auth/api-key/exchange`)


<a id="tc-036"></a>
###### TC-036 — Test: Successful exchange returns signed JWT
- **Preparation:** Create user + API key with permissions; ensure JWKS record exists with decryptable private key.
- **Steps:** POST to `/api/auth/api-key/exchange` with `{ apiKey }`.
- **Assertions:** 200 response with `token`, `tokenType="Bearer"`, `expiresIn=900`; decode JWT, verify signature via JWKS; claims include `scope="api_key_exchange"`, `apiKeyId`, and expected permissions.


<a id="tc-037"></a>
###### TC-037 — Test: Missing API key rejected
- **Preparation:** None.
- **Steps:** POST `{}`.
- **Assertions:** 400 with `error="missing_api_key"`.


<a id="tc-038"></a>
###### TC-038 — Test: Invalid API key denied
- **Preparation:** Use random string as key.
- **Steps:** POST with bogus key.
- **Assertions:** 401 `invalid_api_key`; ensure audit log recorded (capture console or hook).


<a id="tc-039"></a>
###### TC-039 — Test: Permission enforcement
- **Preparation:** API key that lacks requested permissions.
- **Steps:** POST including `permissions` requesting unauthorized scopes.
- **Assertions:** 401 `invalid_api_key` (verify backend denies), no JWT issued.


<a id="tc-040"></a>
###### TC-040 — Test: JWKS missing yields 500
- **Preparation:** Temporarily remove JWKS record within test transaction.
- **Steps:** Attempt exchange.
- **Assertions:** 500 with `Token signing keys are not configured`.


<a id="tc-041"></a>
###### TC-041 — Test: Private key decryption/import errors handled
- **Preparation:** Corrupt stored encrypted key (restore afterwards).
- **Steps:** POST exchange.
- **Assertions:** 500 with `Failed to process signing key`.


<a id="tc-042"></a>
###### TC-042 — Test: JWT header uses latest `kid`
- **Preparation:** Record `kid` of most recent JWKS entry.
- **Steps:** Successful exchange.
- **Assertions:** JWT header `kid` matches latest key ID.

## Webhook Delivery Queue Worker (`/api/internal/queues/webhook-delivery`)


<a id="tc-043"></a>
###### TC-043 — Test: Valid QStash signature delivers webhook
- **Preparation:** Seed webhook endpoint/event/delivery; stub `deliverWebhook` to return success or route to webhook tester; compute signature using QStash signing key and canonical URL.
- **Steps:** POST worker endpoint with signed body.
- **Assertions:** 200 `delivered`; delivery record updated (`attemptCount` incremented, status success); `recordDeliveryResult` stores response payload.


<a id="tc-044"></a>
###### TC-044 — Test: Missing signature rejected
- **Preparation:** None.
- **Steps:** POST without `Upstash-Signature`.
- **Assertions:** 400 `missing-signature`.


<a id="tc-045"></a>
###### TC-045 — Test: Invalid signature returns 401
- **Preparation:** Sign body with wrong key.
- **Steps:** POST.
- **Assertions:** 401 `invalid-signature`.


<a id="tc-046"></a>
###### TC-046 — Test: Unknown delivery returns 404
- **Preparation:** Body referencing nonexistent event/endpoint.
- **Steps:** POST with valid signature.
- **Assertions:** 404 `delivery-record-not-found`.


<a id="tc-047"></a>
###### TC-047 — Test: Delivery failure triggers retry
- **Preparation:** Stub `deliverWebhook` to return `{ success: false, responseCode: 500 }`.
- **Steps:** POST with valid signature.
- **Assertions:** Response 500 `delivery-failed`; DB attempt count incremented; failure logged.


<a id="tc-048"></a>
###### TC-048 — Test: Verification uses `QUEUE_TARGET_BASE_URL`
- **Preparation:** Set env override during test (e.g., `QUEUE_TARGET_BASE_URL=http://app:3000`); spy on `receiver.verify`.
- **Steps:** POST with valid signature.
- **Assertions:** `verify` call uses configured base URL rather than request host.

## Test Utility Endpoints (`/api/test/trigger-user-update`)


<a id="tc-049"></a>
###### TC-049 — Test: Requires admin session
- **Preparation:** Acquire session cookie for non-admin user.
- **Steps:** POST endpoint.
- **Assertions:** 403 from `requireAdmin`.


<a id="tc-050"></a>
###### TC-050 — Test: Missing userId validation
- **Preparation:** Admin session.
- **Steps:** POST empty body.
- **Assertions:** 400 `userId is required`.


<a id="tc-051"></a>
###### TC-051 — Test: Successful update returns metadata
- **Preparation:** Seed user and capture pre-update timestamp.
- **Steps:** POST with `userId`.
- **Assertions:** 200 with `success: true`; response includes updated `updatedAt`; DB row timestamp advanced; optionally confirm webhook event queued.


<a id="tc-052"></a>
###### TC-052 — Test: Unknown user returns 404
- **Preparation:** None.
- **Steps:** POST with random ID.
- **Assertions:** 404 `User not found`.

## Auth Service CORS & Restricted Paths


<a id="tc-053"></a>
###### TC-053 — Test: CORS preflight on auth endpoints
- **Preparation:** None.
- **Steps:** Send `OPTIONS` to `/api/auth/oauth/token` with origin from trusted list.
- **Assertions:** Response 204 with `Access-Control-Allow-Origin` echoing origin; credentials allowed.


<a id="tc-054"></a>
###### TC-054 — Test: Untrusted origin blocked
- **Preparation:** Use disallowed origin.
- **Steps:** Same OPTIONS request.
- **Assertions:** Returns 403 or lacks CORS headers, causing browser to block.


<a id="tc-055"></a>
###### TC-055 — Test: Restricted signup requires secret header
- **Preparation:** Identify restricted path `/api/auth/sign-up/email`.
- **Steps:** POST without `INTERNAL_SIGNUP_SECRET_HEADER`.
- **Assertions:** Receives 403.
- **Steps:** Retry with correct header.
- **Assertions:** Request passes through (201 or success response).

## Security & Hardening Tests

### Session & Authentication Controls


<a id="tc-056"></a>
###### TC-056 — Test: Session cookie attributes
- **Preparation:** Perform login via admin flow (Chromium context).
- **Steps:** Inspect `cookies()` from Playwright context for `session` (or Better Auth cookie).
- **Assertions:** `httpOnly=true`, `secure=true` (under HTTPS/CI), `sameSite="lax"` or stricter; optional: verify `expires` aligned with session policy.


<a id="tc-057"></a>
###### TC-057 — Test: Session invalidation on logout
- **Preparation:** Authenticated admin session.
- **Steps:** Call `auth.api.signOut` via client (or UI logout).
- **Assertions:** Subsequent admin page access redirects to sign-in; session cookie removed/invalid; DB session entry deleted.


<a id="tc-058"></a>
###### TC-058 — Test: Brute-force protection (rate limited credentials)
- **Preparation:** None.
- **Steps:** Attempt >N failed sign-ins rapidly (determine throttle threshold from Better Auth defaults).
- **Assertions:** Eventually responses include throttle error (`Too many attempts`); successful credentials after threshold still work once cooldown passes.

### Cross-Origin & OAuth Hardening


<a id="tc-059"></a>
###### TC-059 — Test: Cross-origin POST to admin endpoint blocked
- **Preparation:** Start logged-out browser context; craft `fetch` from malicious origin (use Playwright to set `Origin` header and attempt credentialed POST to `/admin/settings` or similar).
- **Steps:** Issue credentialed POST without valid session (or using stolen cookie in second context) ensuring `credentials: "include"` and `Origin=https://evil.example`.
- **Assertions:** Request rejected (403/401); no session is established; response lacks `Access-Control-Allow-Origin`, confirming SameSite/CORS defences.


<a id="tc-060"></a>
###### TC-060 — Test: OAuth error responses sanitized
- **Preparation:** Build authorize request with malformed parameters (e.g., invalid `redirect_uri`).
- **Steps:** Follow redirect chain.
- **Assertions:** Error response contains standard OAuth error codes/descriptions without stack traces or secret values; HTTP status 302 -> error page with sanitized message only.


### Input Validation & Sanitisation


<a id="tc-061"></a>
###### TC-061 — Test: API key listing/exchange responses redact secret material
- **Preparation:** Issue API key create/list/exchange calls.
- **Steps:** Inspect responses for fields such as `secret`, plain hashes, or client secrets.
- **Assertions:** Responses exclude raw secrets or encrypted blobs; only prefixes/metadata returned.

<a id="tc-062"></a>
###### TC-062 — Test: Tampered JWT rejected
- **Preparation:** Obtain valid access token; intentionally modify payload (`sub`) without resigning.
- **Steps:** Send token to protected API (e.g., `/api/admin/*`) or use Better Auth introspection.
- **Assertions:** Request denied (`401/invalid_token`); server logs signature failure; no partial access granted.

<a id="tc-063"></a>
###### TC-063 — Test: Reject invalid redirect URIs
- **Preparation:** Attempt client registration with `javascript:alert(1)` or relative URLs.
- **Steps:** Submit form / API request.
- **Assertions:** Server returns validation error; DB not updated.

<a id="tc-064"></a>
###### TC-064 — Test: Webhook secret retrieval requires ownership
- **Preparation:** Create two users; give one a webhook.
- **Steps:** As second user, attempt to call secret retrieval endpoint for first user’s webhook.
- **Assertions:** Request denied (404/403); no secret leaked; audit log optional.

<a id="tc-065"></a>
###### TC-065 — Test: Permission builder rejects invalid names
- **Preparation:** Access control page.
- **Steps:** Enter resource/action with disallowed characters (e.g., `drop table`).
- **Assertions:** Toast error “Invalid resource name/action”; no save.

### Secrets & Sensitive Data Handling

<a id="tc-066"></a>
###### TC-066 — Test: Secrets not leaked in UI
- **Preparation:** Create confidential client and webhook.
- **Steps:** Navigate to detail pages post creation.
- **Assertions:** Secret input shows masked value or placeholder; `innerText` does not expose actual secret; only copyable modal reveals once.

<a id="tc-067"></a>
###### TC-067 — Test: Secret regeneration invalidates old credentials
- **Preparation:** Record current client secret; generate access token using it.
- **Steps:** Rotate secret; attempt to use old secret to obtain token.
- **Assertions:** Old secret fails; new secret succeeds (proving revocation).

<a id="tc-068"></a>
###### TC-068 — Test: Webhook secret copy requires explicit action
- **Preparation:** Visit webhook detail.
- **Steps:** Confirm secret field read-only/masked until regenerate or copy flow invoked.
- **Assertions:** No secret value in DOM until explicit action; ensures one-time reveal.

### JWKS & Cryptographic Integrity

<a id="tc-069"></a>
###### TC-069 — Test: JWKS rotation schedule enforced
- **Preparation:** Set `JWKS_ROTATION_INTERVAL_MS` short for test; call rotation twice.
- **Steps:** Trigger `rotate-jwks` endpoint twice within/after interval.
- **Assertions:** First call rotates; second within window returns `rotated=false`; ensures rate limited rotation.

<a id="tc-070"></a>
###### TC-070 — Test: Token fails after JWKS pruning
- **Preparation:** Issue token signed with old key; rotate/prune keys.
- **Steps:** After `rotate-jwks` prunes old key, attempt to verify token.
- **Assertions:** Verification fails; ensures stale keys removed.

### Queue & Webhook Security

<a id="tc-071"></a>
###### TC-071 — Test: QStash signature required
- **Preparation:** Already covered (missing signature). Extend to HEAD/GET methods.
- **Steps:** Send GET request to queue endpoint with signature.
- **Assertions:** Only POST accepted; others 405/404.

<a id="tc-072"></a>
###### TC-072 — Test: Replay attack prevention
- **Preparation:** Send valid QStash payload; capture body & signature.
- **Steps:** Replay same payload after processing.
- **Assertions:** Signature verification fails (due to changed timestamp if included) or delivery deduped; if not, add check (document risk).

### CORS & Origin Security
<a id="tc-073"></a>
###### TC-073 — Test: Trusted origin wildcard handling
- **Preparation:** Use origin `https://sub.quanghuy.dev` (allowed via wildcard).
- **Steps:** Send CORS preflight/actual request.
- **Assertions:** `Access-Control-Allow-Origin` reflects the requesting origin (not `*`); credentials allowed only for trusted origin.

<a id="tc-074"></a>
###### TC-074 — Test: CORS responses include `Vary: Origin`
- **Preparation:** Perform preflight requests from two different allowed origins sequentially.
- **Steps:** Inspect response headers.
- **Assertions:** `Vary: Origin` present to prevent cache poisoning; header absent is a bug.

### Rate Limiting & Abuse Signals

<a id="tc-075"></a>
###### TC-075 — Test: API key exchange rate limiting (if applicable)
- **Preparation:** Determine expected throttle policy (if none, mark TODO).
- **Steps:** Rapidly call `/api/auth/api-key/exchange`.
- **Assertions:** If rate limit present, expect 429; otherwise document need for future improvement.

<a id="tc-076"></a>
###### TC-076 — Test: Webhook delivery retry cap
- **Preparation:** Delivery failure scenario.
- **Steps:** Cause repeated failures > configured retries.
- **Assertions:** After threshold, status becomes `dead`/`failed`; QStash stops retrying.

### Misc Security Checks

<a id="tc-077"></a>
###### TC-077 — Test: Restricted signup header case-sensitivity
- **Preparation:** Provide lowercase/uppercase header variant.
- **Steps:** POST to restricted path.
- **Assertions:** Only exact header accepted; confirm server matches spec.

<a id="tc-078"></a>
###### TC-078 — Test: Clipboard copy sanitized
- **Preparation:** Use `CopyableInput` for secret.
- **Steps:** Trigger copy; check clipboard text.
- **Assertions:** Contains raw secret without extra whitespace or UI text.

<a id="tc-079"></a>
###### TC-079 — Test: Email templates avoid injection
- **Preparation:** Create user with `<script>` in name/email (if allowed).
- **Steps:** Trigger verification email; inspect HTML.
- **Assertions:** User-provided fields sanitized/escaped in email.

--- 

## Admin Clients Area

### Data Prerequisites
- Seed at least one **trusted** client (has `userId` and `clientSecret`) and one **dynamic/public** client (no `userId`, `clientSecret = null`) per suite.
- For pagination tests, seed ≥12 clients.
- For detail pages, ensure related tables (`oauth_access_token`) have entries to surface “Active Tokens” counts.
- Create auxiliary users for assigning access (`createUser` factory).

### `/admin/clients` – List & Filters

<a id="tc-080"></a>
###### TC-080 — Test: Table renders trusted & dynamic clients
- **Preparation:** Insert 2 clients with distinct names (`Trusted QA`, `Dynamic QA`), including redirect URLs and timestamps.
- **Steps:**
  1. Navigate to `/admin/clients`.
  2. Wait for `ResponsiveTable` to populate.
- **Assertions:**
  - Entries match seeded client names and IDs.
  - Trusted entry shows `lock` icon badge; dynamic shows “Dynamic”.
  - Redirect column displays first URI plus “+N more” when applicable.

<a id="tc-081"></a>
###### TC-081 — Test: Search filters by name / ID
- **Preparation:** Seed client named `Searchable Client`; ensure at least one non-matching client exists.
- **Steps:** Type `Searchable` into search box; wait for debounce redirect (query `?search=Searchable`).
- **Assertions:** Only matching client rows remain; search input retains value after `page.reload()`.

<a id="tc-082"></a>
###### TC-082 — Test: Filter by type (All/Trusted/Dynamic)
- **Preparation:** Trusted & dynamic clients exist.
- **Steps:** Click `Trusted` filter, then `Dynamic`, then `All`.
- **Assertions:** Grid updates to show only relevant client types; buttons reflect active variant. URL query `type=` updates accordingly.

<a id="tc-083"></a>
###### TC-083 — Test: Pagination controls
- **Preparation:** Seed 12 clients; initial page (1) shows 10.
- **Steps:** Click `Next`, then `Previous`.
- **Assertions:** Second page shows remaining clients; `Showing X to Y of 12` text updates; `Next` disabled on final page.

<a id="tc-084"></a>
###### TC-084 — Test: Empty state message
- **Preparation:** Ensure at least 1 client exists, then search for a random term that yields no hits.
- **Steps:** Enter `NoSuchClient-${Date.now()}` in search.
- **Assertions:** `emptyMessage` “No OAuth clients found” is visible; pagination controls hidden.

<a id="tc-085"></a>
###### TC-085 — Test: Row navigation to detail
- **Preparation:** Use existing client.
- **Steps:** Click row action icon (three dots) or mobile card arrow.
- **Assertions:** Lands on `/admin/clients/<clientId>`; heading displays client name.

### `/admin/clients/register` – Client Creation

<a id="tc-086"></a>
###### TC-086 — Test: Required field validation
- **Preparation:** None beyond admin login.
- **Steps:** Click “Register Client” with empty form.
- **Assertions:** Zod validation errors appear under `Client Name`, `Application Type`, `Redirect URIs`.

<a id="tc-087"></a>
###### TC-087 — Test: URL list builder adds hidden redirect payload
- **Preparation:** None.
- **Steps:** Use `UrlListBuilder` to add two URIs; inspect hidden input `name="redirectURLs"`.
- **Assertions:** Hidden input contains newline-separated list matching UI.

<a id="tc-088"></a>
###### TC-088 — Test: Create confidential trusted client
- **Preparation:** None.
- **Steps:** Fill fields (name, type `web`, redirect `https://example.com/callback`, choose auth method default, keep default grant types, enable “Trusted client”), submit.
- **Assertions:** Success screen shows client ID/secret; `Register Client` view hidden; clicking “Go to Clients List” returns to list showing new client (verify via search).
- **Cleanup:** Delete inserted client via DB (including associated rows).

<a id="tc-089"></a>
###### TC-089 — Test: Toggle grant types
- **Preparation:** None.
- **Steps:** Deselect default grant types, select `client_credentials` only, submit.
- **Assertions:** Submission blocked with inline “At least one grant type is required” error until at least one selected; upon submit, confirm metadata `grantTypes` persisted (verify via detail API or DB).

<a id="tc-090"></a>
###### TC-090 — Test: Cancel button returns to previous page
- **Preparation:** Navigate from clients list.
- **Steps:** Click `Cancel`.
- **Assertions:** Browser navigates back to `/admin/clients`; no new client inserted.

<a id="tc-091"></a>
###### TC-091 — Test: Validation for invalid redirect URL
- **Preparation:** None.
- **Steps:** Enter `not-a-url` in redirect list, submit.
- **Assertions:** URL builder displays validation error; form does not submit.

### `/admin/clients/:id` – Overview & Metadata

<a id="tc-092"></a>
###### TC-092 — Test: Overview renders metadata & stats
- **Preparation:** Seed client with `redirectURLs`, metadata (`grantTypes`, `tokenEndpointAuthMethod`) plus `oauth_access_token` row.
- **Steps:** Visit `/admin/clients/<clientId>`.
- **Assertions:** Client name header, Active badge, copyable ID field, redirect list size, grant type checkboxes reflect metadata, usage stats show seeded numbers.

<a id="tc-093"></a>
###### TC-093 — Test: Edit & save client metadata
- **Preparation:** Existing client from above.
- **Steps:** Click `Edit`, change name, add redirect, toggle grant types, click `Save Changes`.
- **Assertions:** Toast “Client updated successfully”; view mode shows updated values; hidden `new secret` modal absent (since not regenerated). Persist changes in DB.

<a id="tc-094"></a>
###### TC-094 — Test: Cancel edit reverts state
- **Preparation:** With editable client.
- **Steps:** Enter edit mode, modify fields, click `Cancel`.
- **Assertions:** Form reverts to original values; edit mode exits without saving.

<a id="tc-095"></a>
###### TC-095 — Test: Validation error when name blank
- **Preparation:** Same client.
- **Steps:** Edit, clear `Client Name`, save.
- **Assertions:** Error toast and inline validation message appear; remain in edit mode.

<a id="tc-096"></a>
###### TC-096 — Test: Disable & re-enable client
- **Preparation:** Active client.
- **Steps:** Click `Disable Client`, confirm modal, wait for toast; then click `Enable Client`.
- **Assertions:** Badge switches to “Disabled”/“Active”; `toggleClientStatus` call returns success; UI refreshes.

<a id="tc-097"></a>
###### TC-097 — Test: Rotate secret flow
- **Preparation:** Confidential client with secret.
- **Steps:** Click `Rotate Secret`, confirm modal, wait for “Client secret rotated” toast.
- **Assertions:** New secret modal displays generated key; capturing value optional; closing modal triggers page refresh. DB `clientSecret` updated.

<a id="tc-098"></a>
###### TC-098 — Test: Delete client
- **Preparation:** Client created specifically for deletion.
- **Steps:** Click `Delete Client`, confirm modal.
- **Assertions:** Toast “Client deleted successfully”; redirected to `/admin/clients`; ensure client removed from DB.

<a id="tc-099"></a>
###### TC-099 — Test: Public client omits secret field & actions
- **Preparation:** Seed public client (no `clientSecret`).
- **Steps:** Visit overview.
- **Assertions:** Secret field absent; rotate secret button not rendered; Danger Zone shows only Delete.

### `/admin/clients/:id/access` – Access Control

<a id="tc-100"></a>
###### TC-100 — Test: Access policy toggle to restricted
- **Preparation:** Client metadata set to `all_users`; ensure no allowed resources.
- **Steps:** Click “Switch to Restricted Access”, confirm modal.
- **Assertions:** Badge updates to “Restricted”; toast describes enabling API keys; DB metadata `accessPolicy` updated.

<a id="tc-101"></a>
###### TC-101 — Test: Access policy toggle back to open
- **Preparation:** Client currently restricted.
- **Steps:** Click button (no modal) to return to open.
- **Assertions:** Badge “Open”; toast indicates open access; metadata persists.

<a id="tc-102"></a>
###### TC-102 — Test: Allowed resources validation & save
- **Preparation:** Restricted client; ensures `checkResourceDependencies` returns empty (no API keys).
- **Steps:** Add row `invoices` with actions `read, write`, click `Save Resources`.
- **Assertions:** Toast success; reload shows persisted row; DB metadata updated (JSON).

<a id="tc-103"></a>
###### TC-103 — Test: Invalid resource name blocked
- **Preparation:** Same client.
- **Steps:** Enter resource `bad resource` (contains space), attempt save.
- **Assertions:** Toast “Invalid resource name”; state untouched.

<a id="tc-104"></a>
###### TC-104 — Test: Resource removal blocked by conflicting API keys
- **Preparation:** Create API key with permission `projects:read`; set default permissions to include same; then attempt to remove via builder.
- **Steps:** Delete row `projects`, save.
- **Assertions:** Toast “Cannot remove resources in use” with conflict detail.

<a id="tc-105"></a>
###### TC-105 — Test: Assign user via picker
- **Preparation:** Create secondary user; ensure not already assigned.
- **Steps:** Open “Assign User”, use picker to select user, choose `admin` level, set expiration 7 days, submit.
- **Assertions:** Toast “User assigned”; table row shows user, access level `admin`, expiry date within expected range.

<a id="tc-106"></a>
###### TC-106 — Test: Prevent duplicate assignment
- **Preparation:** User already assigned.
- **Steps:** Reopen assign modal, attempt same user.
- **Assertions:** Toast error “User already has access…”.

<a id="tc-107"></a>
###### TC-107 — Test: Edit user access
- **Preparation:** Assigned user with expiry.
- **Steps:** Click edit icon, change access level to `use`, clear expiration, submit.
- **Assertions:** Toast “Access updated”; table row reflects new level, `Expires` column “Never”.

<a id="tc-108"></a>
###### TC-108 — Test: Remove user access
- **Preparation:** Assigned user.
- **Steps:** Click delete icon, confirm modal.
- **Assertions:** Toast success; row removed.

<a id="tc-109"></a>
###### TC-109 — Test: Create user group
- **Preparation:** None.
- **Steps:** Click “Create Group”, provide name & description, submit.
- **Assertions:** Toast “Group created”; groups list displays entry with member count 0.

<a id="tc-110"></a>
###### TC-110 — Test: Loading skeleton appears before data
- **Preparation:** Intercept `getClientMetadata` call to delay response 1s using `page.route`.
- **Steps:** Navigate to access page.
- **Assertions:** `ContentSkeleton` placeholders visible during delay; replaced once resolved.

### `/admin/clients/:id/api-keys` – API Keys

<a id="tc-111"></a>
###### TC-111 — Test: API keys disabled message
- **Preparation:** Client with metadata `allowsApiKeys=false`.
- **Steps:** Visit `/api-keys`.
- **Assertions:** Empty state card with button linking back to access settings.

<a id="tc-112"></a>
###### TC-112 — Test: Default permission selection
- **Preparation:** Client with allowed resources (`invoices:read`, `projects:write`).
- **Steps:** In default permissions card, select subset via `PermissionTagInput`, click `Save Defaults`.
- **Assertions:** Toast success; reload show selected tags persisted (via metadata).

<a id="tc-113"></a>
###### TC-113 — Test: Select all shortcut
- **Preparation:** Same as above.
- **Steps:** Click “Select All”, save.
- **Assertions:** All available permissions selected; metadata reflects all.

<a id="tc-114"></a>
###### TC-114 — Test: Create API key with expiration & permissions
- **Preparation:** Allowed resources defined; ensures no prior keys.
- **Steps:** Click `Create`, fill name, set expiration `30 days`, select 2 permissions, submit form.
- **Assertions:** Creation modal closes, new secret modal shows key value; list displays new key with `Expires` matching 30 days ahead, permissions column `2 resources`.

<a id="tc-115"></a>
###### TC-115 — Test: Downloaded secret modal dismissal
- **Preparation:** After creation above.
- **Steps:** Close secret modal using primary button.
- **Assertions:** Modal closes, data reload occurs, list persists.

<a id="tc-116"></a>
###### TC-116 — Test: Edit API key permissions
- **Preparation:** API key exists.
- **Steps:** Click edit icon, toggle permissions (remove one), submit.
- **Assertions:** Toast success; list updates resource count; DB permissions JSON updated.

<a id="tc-117"></a>
###### TC-117 — Test: Revoke API key
- **Preparation:** API key exists.
- **Steps:** Click delete icon, confirm revoke modal.
- **Assertions:** Toast success; key removed from list.

<a id="tc-118"></a>
###### TC-118 — Test: Loading skeleton
- **Preparation:** Delay `listClientApiKeys` via `page.route`.
- **Steps:** Navigate to page.
- **Assertions:** `ContentSkeleton` visible, replaced post-response.

---

## Admin Webhooks Area

### Data Prerequisites
- Seed baseline webhook endpoints belonging to admin user with varying statuses (`isActive=true/false`), different subscribed events, and recent delivery history records (success & failure).
- Use `generateWebhookId`-style IDs and store encrypted secret (use helper from `lib/utils/security` or inline encryption method to match app expectation).
- For metrics tests, insert `webhook_delivery` rows covering last 7 days with known counts so success rate is deterministic.

### `/admin/webhooks` – List, Filters, Actions

<a id="tc-119"></a>
###### TC-119 — Test: Metrics card displays aggregated stats
- **Preparation:** Insert deliveries with known success/failed ratios (e.g., 70% success).
- **Steps:** Visit `/admin/webhooks`.
- **Assertions:** Metrics card value equals computed success rate; trend label present; chart renders points count = 7.

<a id="tc-120"></a>
###### TC-120 — Test: Table renders webhook attributes
- **Preparation:** Seed webhook with subscriptions `[user.created, user.updated]`, last delivery success.
- **Steps:** Load page.
- **Assertions:** Row shows display name, URL truncated, badges for events (first two + “+X more”), status badge matches `isActive`, last delivery icon color matches status.

<a id="tc-121"></a>
###### TC-121 — Test: Search by URL/name
- **Preparation:** Seed unique display name `Invoices Sink`.
- **Steps:** Type `Invoices` in search.
- **Assertions:** Only matching row remains; query param `search=` updated.

<a id="tc-122"></a>
###### TC-122 — Test: Filter by status + event type
- **Preparation:** At least one active and inactive webhook; multiple event types.
- **Steps:** Switch status buttons (`Inactive`), choose event type from dropdown.
- **Assertions:** Table reflects filter; query params `status`, `eventType` update.

<a id="tc-123"></a>
###### TC-123 — Test: Pagination
- **Preparation:** Seed >10 webhooks.
- **Steps:** Click `Next`.
- **Assertions:** Table shows next page; counters update; `Previous` button re-enables.

<a id="tc-124"></a>
###### TC-124 — Test: Actions dropdown – View details
- **Preparation:** Webhook exists.
- **Steps:** Open dropdown (kebab), click “View details”.
- **Assertions:** Navigates to `/admin/webhooks/<id>`.

<a id="tc-125"></a>
###### TC-125 — Test: Actions dropdown – Toggle active state
- **Preparation:** Webhook initially active.
- **Steps:** Choose “Disable”; confirm modal.
- **Assertions:** Toast success, row badge switches to inactive, DB `is_active=false`.

<a id="tc-126"></a>
###### TC-126 — Test: Actions dropdown – Trigger test event
- **Preparation:** Ensure webhook URL points to `http://webhook-tester:8080/<session>`.
- **Steps:** Click “Send test event”.
- **Assertions:** Toast “Test queued”; polling `webhookInspector.waitFor({ path: "/<session>" })` returns payload; row refresh updates last delivery timestamp/status when job completes.

<a id="tc-127"></a>
###### TC-127 — Test: Actions dropdown – Delete webhook
- **Preparation:** Webhook created specifically for deletion.
- **Steps:** Choose “Delete”, confirm modal.
- **Assertions:** Toast success, row removed, DB entry gone.

### `/admin/webhooks/create` – Creation Form

<a id="tc-128"></a>
###### TC-128 — Test: Required validation errors
- **Preparation:** None.
- **Steps:** Submit empty form.
- **Assertions:** Zod errors for display name, URL, events.

<a id="tc-129"></a>
###### TC-129 — Test: Create webhook with advanced options
- **Preparation:** Clean webhook tester queue.
- **Steps:** Fill display name, allowed URL (localhost), pick multiple events, open advanced section to set retry policy `aggressive`, delivery format `form-encoded`, request method `PUT`, leave active. Submit.
- **Assertions:** Success screen shows webhook ID & secret; secret masked but copy button available; `Done` navigates back to list where webhook appears with chosen settings.

<a id="tc-130"></a>
###### TC-130 — Test: Invalid URL rejected
- **Preparation:** None.
- **Steps:** Enter `ftp://example.com` and submit.
- **Assertions:** Inline error “URL must use HTTPS…” appears.

<a id="tc-131"></a>
###### TC-131 — Test: Success screen secret copy button
- **Preparation:** After successful creation.
- **Steps:** Click copy icon (simulate via clipboard intercept).
- **Assertions:** Clipboard contains secret; toast (if any) appears.

### `/admin/webhooks/:id` – Detail & Delivery Logs

<a id="tc-132"></a>
###### TC-132 — Test: Settings tab loads persisted values
- **Preparation:** Webhook with known metadata and subscriptions.
- **Steps:** Visit page (defaults to Settings tab).
- **Assertions:** Form fields pre-populated; secret field masked; event selector shows chosen events; toggle matches `isActive`.

<a id="tc-133"></a>
###### TC-133 — Test: Update webhook settings
- **Preparation:** Same webhook.
- **Steps:** Modify display name, toggle `Enable webhook` off, adjust events, change retry policy, submit.
- **Assertions:** Toast “Webhook updated”; toast success; on reload values persist; list view reflects updated status.

<a id="tc-134"></a>
###### TC-134 — Test: Regenerate secret
- **Preparation:** Webhook active.
- **Steps:** Click “Regenerate secret”.
- **Assertions:** Toast success, secret field switches to reveal new secret (editable). Optionally verify DB `encryptedSecret` changed.

<a id="tc-135"></a>
###### TC-135 — Test: Delete webhook from detail page
- **Preparation:** Webhook dedicated for deletion.
- **Steps:** Click “Delete Webhook” button in form.
- **Assertions:** Modal confirm leads to toast success and redirect to `/admin/webhooks`.

<a id="tc-136"></a>
###### TC-136 — Test: Delivery logs render table
- **Preparation:** Insert ≥3 delivery records with different statuses, codes, durations.
- **Steps:** Switch to “Delivery Logs” tab.
- **Assertions:** Table rows show status badge, response code, attempt count, relative time; empty state absent.

<a id="tc-137"></a>
###### TC-137 — Test: Empty delivery state
- **Preparation:** Webhook with no deliveries.
- **Steps:** Visit Delivery Logs tab.
- **Assertions:** Shows “Last 25 webhook delivery attempts” header with message indicating no data (if component handles).

<a id="tc-138"></a>
###### TC-138 — Test: Test webhook button from detail page
- **Preparation:** Ensure `testWebhook` route accessible.
- **Steps:** Use action button (if present) or go via list.
- **Assertions:** Similar to list test verifying callback recorded.

---

## Admin Users Area

### Data Prerequisites
- Seed diverse users:
  - Verified & unverified statuses.
  - Users with multiple providers (`google`, `github`, `credential`).
  - Users with sessions (active & expired).
- For creation tests, ensure email uniqueness; clean up by deleting created users.
- For email tests, clear MailHog before triggers.

### `/admin/users` – List, Search, Filters

<a id="tc-139"></a>
###### TC-139 — Test: Table renders email, status, providers
- **Preparation:** Seed user with name, email, verified true, linked accounts for Google & credential.
- **Steps:** Visit `/admin/users`.
- **Assertions:** Row displays email, name, badge “Verified”, provider icons (mail + remote icon), creation date.

<a id="tc-140"></a>
###### TC-140 — Test: Search by email/name
- **Preparation:** Unique user `qa-search@example.com`.
- **Steps:** Enter portion of email into search.
- **Assertions:** Only matching row remains; query `search=` set.

<a id="tc-141"></a>
###### TC-141 — Test: Filter by verification status
- **Preparation:** Have both verified/unverified users.
- **Steps:** Click `Verified`, `Unverified`, `All`.
- **Assertions:** Table updates accordingly; `verified` query param toggles between `true`, `false`, absent.

<a id="tc-142"></a>
###### TC-142 — Test: Pagination
- **Preparation:** Insert >10 users.
- **Steps:** Navigate to page 2.
- **Assertions:** Table shows next set; `Next` disabled on last page; showing range text correct.

<a id="tc-143"></a>
###### TC-143 — Test: Empty state
- **Preparation:** Run search term that matches none.
- **Steps:** Enter unique random string.
- **Assertions:** `emptyMessage` “No users found”.

<a id="tc-144"></a>
###### TC-144 — Test: Row navigation to detail
- **Preparation:** Use seeded user.
- **Steps:** Click row action icon.
- **Assertions:** Reaches `/admin/users/<id>`.

### `/admin/users/create` – Manual User Creation

<a id="tc-145"></a>
###### TC-145 — Test: Required validation
- **Preparation:** None.
- **Steps:** Submit empty form.
- **Assertions:** Errors for name/email.

<a id="tc-146"></a>
###### TC-146 — Test: Create user with password
- **Preparation:** Ensure email unused.
- **Steps:** Fill full name, email, password, leave invite unchecked, submit.
- **Assertions:** Success splash shown; after redirect confirm user appears in list (search by email). DB user has hashed password and `email_verified=false`.
- **Cleanup:** Delete user record and related entries.

<a id="tc-147"></a>
###### TC-147 — Test: Invite flow clears password field
- **Preparation:** None.
- **Steps:** Fill password, then check “Send invitation email”.
- **Assertions:** Password input becomes read-only and cleared; tooltip text updates accordingly.

<a id="tc-148"></a>
###### TC-148 — Test: Send invite triggers email
- **Preparation:** Clear MailHog; set `sendInvite=true`.
- **Steps:** Submit form.
- **Assertions:** Success splash indicates invite sent; poll MailHog to confirm email to recipient with reset link.

<a id="tc-149"></a>
###### TC-149 — Test: Cancel button navigates back
- **Preparation:** Navigate from list.
- **Steps:** Click `Cancel`.
- **Assertions:** Returns to `/admin/users`; no user created.

### `/admin/users/:id` – Detail Tabs

<a id="tc-150"></a>
###### TC-150 — Test: Profile tab renders data
- **Preparation:** Seed user with username/displayUsername.
- **Steps:** Visit detail page.
- **Assertions:** Header shows initials/avatar, verification badge, email; copyable ID field present; system info populated.

<a id="tc-151"></a>
###### TC-151 — Test: Edit profile fields
- **Preparation:** Same user.
- **Steps:** Click `Edit`, modify name & usernames, submit.
- **Assertions:** Toast success; values update; DB reflects.

<a id="tc-152"></a>
###### TC-152 — Test: Toggle email verification
- **Preparation:** Start with unverified user.
- **Steps:** Click “Mark Verified”.
- **Assertions:** Toast “Status updated”; badge switches to Verified; DB `email_verified=1`.

<a id="tc-153"></a>
###### TC-153 — Test: Force logout all sessions
- **Preparation:** User with multiple sessions.
- **Steps:** Click “Force Logout All”, confirm modal.
- **Assertions:** Toast success; DB `session` rows deleted; UI shows “No active sessions”.

<a id="tc-154"></a>
###### TC-154 — Test: Linked accounts list & unlink
- **Preparation:** User with ≥2 accounts (credential + google).
- **Steps:** In Linked Accounts tab, click `Unlink` on non-primary provider; confirm.
- **Assertions:** Toast success; account removed; cannot unlink final remaining provider (button hidden).

<a id="tc-155"></a>
###### TC-155 — Test: Session revoke
- **Preparation:** User with session entry.
- **Steps:** Click `Revoke` on a session, confirm modal.
- **Assertions:** Toast success; session removed.

<a id="tc-156"></a>
###### TC-156 — Test: Set password modal validation
- **Preparation:** User accessible.
- **Steps:** Open “Set New Password”, attempt to save <8 chars.
- **Assertions:** Toast error “Password too short”; field shows error.
- **Steps:** Enter valid password, save.
- **Assertions:** Toast success; modal closes; password reset in DB (hashed).

<a id="tc-157"></a>
###### TC-157 — Test: Send password reset email
- **Preparation:** Clear MailHog.
- **Steps:** Open modal, confirm send.
- **Assertions:** Toast success; MailHog records email to user.

<a id="tc-158"></a>
###### TC-158 — Test: Force logout & session tabs reflect emptiness
- **Preparation:** After force logout above.
- **Steps:** Navigate to Sessions tab.
- **Assertions:** Empty state message shown.

<a id="tc-159"></a>
###### TC-159 — Test: Activity tab placeholder
- **Preparation:** None.
- **Steps:** Open Activity tab.
- **Assertions:** Placeholder text “Activity log coming soon...” displayed.

<a id="tc-160"></a>
###### TC-160 — Test: Error messaging on failed profile update
- **Preparation:** Intercept update request to respond 500.
- **Steps:** Enter edit mode, `page.route` to return 500, submit.
- **Assertions:** Toast “Update failed”; remains in edit mode; fields unchanged.

---

## Additional Considerations
- **Concurrency:** Configure suites to run serially per area to avoid shared record contention (`test.describe.configure({ mode: "serial" })` where required).
- **Visual regressions:** Optional – capture Playwright snapshots for key views (list tables, success screens) after deterministic seeding.
- **Accessibility checks:** Optionally integrate `axe-core` via Playwright to scan forms/modals after render.
- **Monitoring background jobs:** Some flows rely on background processing (test webhook, toggling policies). Implement polling with timeouts (e.g., wait up to 15s for delivery status change).
- **CI integration:** Provide npm script `pnpm test:e2e -- --project=chromium` executed after docker-compose environment ready. Ensure tests can reuse existing build artifacts to reduce runtime.

This plan enumerates every required test case, the data each scenario must seed, the interactive steps to execute with Playwright, the assertions to perform, and the necessary cleanup strategies to maintain deterministic runs in a production-mode Docker environment.
