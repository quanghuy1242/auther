# Better Auth → PayloadCMS Webhook Sync

Better Auth does not ship a built-in outbound webhook system. When you need to notify PayloadCMS (or any other service) about identity events, wire those calls yourself through the `hooks.after` lifecycle or per-endpoint middleware.

This guide explains how to emit webhooks after key auth events and keep Payload in sync.

## Supported Hook Points
Better Auth exposes two server-side hook entry points via `betterAuth({ hooks: { before, after } })`:
- **`hooks.before`** runs before any endpoint logic. Useful for request validation.
- **`hooks.after`** runs after an endpoint resolves. The context object contains:
  - `ctx.path`: resolved auth route (e.g., `/sign-up/email`, `/sign-out`, `/oauth2/register`).
  - `ctx.context.session`: current session (if authenticated).
  - `ctx.context.newSession`: session created during the request (e.g., after sign-in).
  - `ctx.context.returned`: value returned by the endpoint (user objects, tokens, etc.).

You can attach multiple middleware blocks using `createAuthMiddleware`. Each block decides whether to act by inspecting `ctx.path` and the returned payload.

## Events Worth Syncing
| Event | Endpoint Path | Payload Fields |
|-------|---------------|----------------|
| User created | `/sign-up/email`, `/oauth/callback` | `ctx.context.returned.user` |
| User updated (change email/password) | `/change-email`, `/change-password`, `/update-user` | `ctx.context.returned.user` |
| Session started | `/sign-in/email`, `/sign-in/*` | `ctx.context.newSession` |
| Session revoked | `/sign-out`, `/revoke-session`, `/revoke-sessions` | `ctx.context.returned` (status) + `ctx.context.session` |
| OAuth client registered | `/oauth2/register` | `ctx.context.returned` (client metadata) |
| OAuth client removed/rotated | Custom admin API you expose (not provided yet) |

Decide which of these matter to PayloadCMS. For example, if Payload stores Better Auth users in a collection, sync on create/update/delete. If Payload issues API keys, also react to `/api-key/*` endpoints (Better Auth’s API key plugin).

## Implementation Outline
1. **Choose a webhook target** in PayloadCMS. Create an authenticated endpoint that accepts JSON events (`POST /api/webhooks/better-auth`).
2. **Add environment variables** to store the endpoint and signing secret:
   ```env
   PAYLOAD_WEBHOOK_URL=https://cms.example.com/api/webhooks/better-auth
   PAYLOAD_WEBHOOK_SECRET=replace-me
   ```
3. **Update `betterAuth` configuration** in `src/lib/auth.ts`:
   ```ts
   import { createAuthMiddleware } from "better-auth/api";

   async function sendWebhook(event: string, payload: unknown) {
     await fetch(env.PAYLOAD_WEBHOOK_URL, {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         "X-BetterAuth-Event": event,
         "X-BetterAuth-Signature": await signPayload(payload, env.PAYLOAD_WEBHOOK_SECRET),
       },
       body: JSON.stringify(payload),
     });
   }

   const afterHooks = createAuthMiddleware(async (ctx) => {
     switch (ctx.path) {
       case "/sign-up/email":
         if (ctx.context.returned?.user) {
           await sendWebhook("user.created", {
             user: ctx.context.returned.user,
           });
         }
         break;
       case "/change-email":
         if (ctx.context.returned?.user) {
           await sendWebhook("user.updated", {
             user: ctx.context.returned.user,
             sessionId: ctx.context.session?.session.id,
           });
         }
         break;
       case "/sign-in/email":
         if (ctx.context.newSession) {
           await sendWebhook("session.created", {
             session: ctx.context.newSession.session,
             user: ctx.context.newSession.user,
           });
         }
         break;
       // add more cases as needed
       default:
         break;
     }
   });

   export const auth = betterAuth({
     // existing options…
     hooks: {
       before: existingBeforeHook,
       after: afterHooks,
     },
   });
   ```

   Notes:
   - `signPayload` should HMAC-sign the JSON string so PayloadCMS can verify authenticity.
   - Always wrap fetch calls with try/catch and add logging. Consider `Promise.allSettled` if you fire multiple webhooks.
   - Keep hook handlers fast. If the webhook target is slow, enqueue the job (e.g., in a background worker or message queue) instead of awaiting it inline.

4. **Secure the webhook consumer** in Payload:
   - Verify the `X-BetterAuth-Signature` header using the shared secret.
   - Validate the event name before processing.
   - Map the payload to PayloadCMS collections (`users`, `auth-clients`, etc.).

5. **Handle Retries & Idempotency**
   - Better Auth hooks currently run inside the request lifecycle. If the webhook fails, the auth request still succeeds. Track failures (e.g., send to Sentry, store in a `webhook_outbox` table).
   - Include an `eventId` (e.g., `crypto.randomUUID()`) in the payload so Payload can deduplicate replays.

## Extending Beyond Hooks
- **Custom API Routes**: For events that do not expose enough data in the hook context (e.g., OAuth client deletions you implement yourself), write dedicated API routes that both mutate the database and call `sendWebhook`.
- **Cron-based Polling**: As a last resort, poll Better Auth tables (users, sessions, oauth_application) and compare with Payload state. Hooks remain the preferred real-time trigger.

## Testing Checklist
- [ ] Create a staging Payload endpoint and secret.
- [ ] Trigger each auth event in development, capture outbound requests with a proxy (e.g., `mitmproxy`).
- [ ] Simulate failure paths (e.g., bring Payload offline) and ensure the auth flow still succeeds while logging the failure.
- [ ] Add unit/integration tests for `sendWebhook` if you extract it into its own module.

With these pieces, Better Auth can publish changes instantly, and PayloadCMS can subscribe without CLI scripts or manual syncs. Update this document as you add new event types or background processing.
