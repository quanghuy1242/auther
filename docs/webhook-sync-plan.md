# Better Auth ↔ Payload CMS Bidirectional Sync Plan

**Date**: October 27, 2025  
**Status**: 🔵 Planning Phase

## Executive Summary

This document outlines a **webhook-based bidirectional synchronization** strategy between Better Auth (identity provider) and PayloadCMS (content management). Because Better Auth does not expose a public management API, synchronization relies on a traditional queue pattern:

1. **Better Auth → Payload**: database hooks enqueue webhook jobs into a shared queue (e.g., Upstash QStash, Redis, Supabase Queue). A worker function dequeues jobs and delivers webhooks to Payload.  
2. **Payload → Better Auth**: collection hooks enqueue webhook jobs into the same or a separate queue. Another worker dequeues jobs and calls Better Auth’s management endpoints.  
3. **Directional webhook secrets & origin markers**: ensure both ends can verify authenticity and avoid change loops.

This design keeps both systems consistent without exposing raw database writes or holding transactions open while waiting for external services.

## Architecture Overview

```
┌─────────────────┐                  ┌──────────────────┐
│  Better Auth    │                  │   Payload CMS    │
│  (Identity DB)  │                  │   (Content DB)   │
└────────┬────────┘                  └────────┬─────────┘
         │                                     │
         │  databaseHooks                      │  collection hooks
         │  (after commit)                     │  (afterChange/afterDelete)
         │                                     │
         ├─► enqueue → queue ─────────┐        │
         │   {origin, event…}         │        │
         │                            ▼        │
         │                   Worker Function ──┼─► POST /api/webhooks/better-auth
         │                                     │    - verify signature, update Payload
         │◄─────────────────────────────────────┤
         │                                     │   enqueue → queue ─────────┐
         │                                     │   {origin, event…}         │
         │                                     │                            ▼
         │                                     │                 Worker Function ──► POST /api/webhooks/payload
         │                                     │                                  - verify signature, call Better Auth API
         └─────────────────────────────────────┘
```

## Key Principles

1. **Event-driven** – every change is captured instantly, no polling.  
2. **Durable** – queues buffer webhook jobs; workers retry failures.  
3. **Loop-safe** – payloads carry `origin` and `webhookId`; receivers skip when they detect self-originated updates.  
4. **Secure** – per-direction HMAC secrets, timestamp validation, and timing-safe comparisons.  
5. **Serverless-compatible** – workers run on cron triggers, scheduled functions, or managed queue processors.  
6. **Observable** – logging and queue stats surface job failures & latency.

---

## Better Auth → Payload Path

### Flow

1. Database hook fires after transaction commit.  
2. Hook enqueues a job with event data (user ID, metadata, origin).  
3. Worker (cron or queue consumer) dequeues jobs and POSTs to Payload webhook endpoint.  
4. Payload receiver updates the user and sets `req.context.betterAuthOrigin = "better-auth"` to suppress further propagation.

### Queue Selection

We standardize on **Upstash QStash**:

- HTTP-first publish API suitable for serverless functions.  
- Automatic retries with exponential backoff.  
- Signed delivery via `Upstash-Signature`, which we verify in worker routes.  
- Optional scheduling/delayed delivery via `notBefore`.

Install the JavaScript client:

```bash
npm install @upstash/qstash
npm install @upstash/redis
```

### Step 1: Hook Enqueue (`src/lib/webhooks/payload.ts`)

```ts
import crypto from "node:crypto";
import { Client } from "@upstash/qstash";
import { env } from "@/env";

const qstash = new Client({ token: env.QSTASH_TOKEN });

type PayloadWebhookEvent = {
  id: string;
  origin: "better-auth";
  type: "user.created" | "user.updated" | "user.deleted";
  timestamp: number;
  data: {
    id: string;
    email: string;
    name?: string | null;
    emailVerified?: boolean;
    image?: string | null;
    username?: string | null;
    displayUsername?: string | null;
  };
};

export async function enqueuePayloadWebhook(event: PayloadWebhookEvent) {
  const targetUrl = resolveQueueTargetUrl("/api/internal/queues/payload");

  await qstash.publishJSON({
    url: targetUrl,
    body: event,
    headers: {
      "X-Origin": "better-auth",
    },
    retries: 3,
  });
  return true;
}

function resolveQueueTargetUrl(path: string) {
  const explicitBase = env.QUEUE_TARGET_BASE_URL;
  if (explicitBase) return `${explicitBase}${path}`;

  const vercelHost = env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}${path}`;

  return `http://localhost:3000${path}`;
}
```

### Step 2: Register Database Hook (`src/lib/auth.ts`)

```ts
import crypto from "node:crypto";
import { betterAuth } from "better-auth";
import { enqueuePayloadWebhook } from "@/lib/webhooks/payload";

export const auth = betterAuth({
  // …existing config…
  databaseHooks: {
    user: {
      create: {
        async after(user, ctx) {
          const origin = ctx.request?.headers.get("x-webhook-origin") ?? ctx.request?.context?.betterAuthOrigin;
          if (origin === "payload") {
            return;
          }
          await enqueuePayloadWebhook({
            id: crypto.randomUUID(),
            origin: "better-auth",
            type: "user.created",
            timestamp: Date.now(),
            data: { ...user },
          });
        },
      },
      update: {
        async after(user, ctx) {
          const origin = ctx.request?.headers.get("x-webhook-origin") ?? ctx.request?.context?.betterAuthOrigin;
          if (origin === "payload") {
            return;
          }
          await enqueuePayloadWebhook({
            id: crypto.randomUUID(),
            origin: "better-auth",
            type: "user.updated",
            timestamp: Date.now(),
            data: { ...user },
          });
        },
      },
      delete: {
        async after(user, ctx) {
          const origin = ctx.request?.headers.get("x-webhook-origin") ?? ctx.request?.context?.betterAuthOrigin;
          if (origin === "payload") {
            return;
          }
          await enqueuePayloadWebhook({
            id: crypto.randomUUID(),
            origin: "better-auth",
            type: "user.deleted",
            timestamp: Date.now(),
            data: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
          });
        },
      },
    },
  },
});
```

### Step 3: Worker to Deliver Webhooks

Create a serverless route (`/api/internal/queues/payload`) that QStash will call:

```ts
import crypto from "node:crypto";
import { Receiver } from "@upstash/qstash";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const redis = Redis.fromEnv();

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("Upstash-Signature");
  const expectedUrl = `${resolveBaseUrl()}/api/internal/queues/payload`;

  await receiver.verify({
    signature,
    body,
    url: expectedUrl,
  });

  const event = JSON.parse(body);

  const added = await redis.sadd("webhooks:processed", event.id);
  if (added === 0) {
    return new Response("duplicate", { status: 200 });
  }
  await redis.expire("webhooks:processed", 60 * 60 * 48);

  const res = await fetch(env.PAYLOAD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": createSignature(body, env.PAYLOAD_OUTBOUND_WEBHOOK_SECRET),
      "X-Webhook-Id": event.id,
      "X-Webhook-Timestamp": event.timestamp.toString(),
      "X-Webhook-Origin": event.origin,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Payload webhook failed: ${res.status}`);
  }

  return new Response("delivered", { status: 200 });
}

function createSignature(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function resolveBaseUrl() {
  const explicit = env.QUEUE_TARGET_BASE_URL;
  if (explicit) return explicit;
  const host = env.VERCEL_URL;
  if (host) return `https://${host}`;
  return "http://localhost:3000";
}
```

QStash automatically retries when the worker returns a non-2xx response.

---

## Payload → Better Auth Path

### Flow

1. Payload user collection hooks detect create/update/delete.  
2. Hook enqueues a job with the Better Auth user ID and change set.  
3. Worker dequeues the job, POSTs to Better Auth’s `/api/webhooks/payload`.  
4. Better Auth receiver updates or deletes the user via `auth.api.updateUser` / `auth.api.deleteUser`, setting a context flag to avoid re-propagation.

### Step 1: Hook Enqueue (Payload)

```ts
import crypto from "node:crypto";
import { Client as QStashClient } from "@upstash/qstash";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

async function enqueueBetterAuthWebhook(event) {
  await qstash.publishJSON({
    url: resolveQueueTargetUrl("/api/internal/queues/better-auth"),
    body: event,
    headers: {
      "X-Origin": "payload",
    },
    retries: 3,
  });
}

function resolveQueueTargetUrl(path: string) {
  const explicitBase = process.env.QUEUE_TARGET_BASE_URL;
  if (explicitBase) return `${explicitBase}${path}`;
  const host = process.env.VERCEL_URL;
  if (host) return `https://${host}${path}`;
  return `http://localhost:3000${path}`;
}

afterChange: [
  async ({ doc, previousDoc, operation, req }) => {
    if (operation !== "update") return doc;
    if (!doc.betterAuthUserId) return doc;
    const origin = req.headers?.["x-webhook-origin"] ?? req.context?.betterAuthOrigin;
    if (origin === "better-auth") return doc;

    const changed =
      doc.email !== previousDoc.email ||
      doc.fullName !== previousDoc.fullName;

    if (!changed) return doc;

    await enqueueBetterAuthWebhook({
      id: crypto.randomUUID(),
      origin: "payload",
      type: "user.updated",
      timestamp: Date.now(),
      data: {
        betterAuthUserId: doc.betterAuthUserId,
        email: doc.email,
        fullName: doc.fullName,
      },
    });

    return doc;
  },
],
afterDelete: [
  async ({ doc, req }) => {
    if (!doc.betterAuthUserId) return;
    const origin = req.headers?.["x-webhook-origin"] ?? req.context?.betterAuthOrigin;
    if (origin === "better-auth") return;

    await enqueueBetterAuthWebhook({
      id: crypto.randomUUID(),
      origin: "payload",
      type: "user.deleted",
      timestamp: Date.now(),
      data: {
        betterAuthUserId: doc.betterAuthUserId,
      },
    });
  },
],
```

### Step 2: Worker to Deliver Webhooks to Better Auth

```ts
import crypto from "node:crypto";
import { Receiver } from "@upstash/qstash";
import { Redis } from "@upstash/redis";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

const redis = Redis.fromEnv();

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("Upstash-Signature");
  const expectedUrl = `${resolveBaseUrl()}/api/internal/queues/better-auth`;

  await receiver.verify({
    signature,
    body,
    url: expectedUrl,
  });

  const event = JSON.parse(body);

  const added = await redis.sadd("webhooks:processed", event.id);
  if (added === 0) {
    return new Response("duplicate", { status: 200 });
  }
  await redis.expire("webhooks:processed", 60 * 60 * 48);

  const res = await fetch(process.env.BETTER_AUTH_WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": createSignature(body, process.env.BETTER_AUTH_OUTBOUND_WEBHOOK_SECRET!),
      "X-Webhook-Origin": "payload",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Better Auth webhook failed: ${res.status}`);
  }
  return new Response("delivered", { status: 200 });
}

function createSignature(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function resolveBaseUrl() {
  const explicit = process.env.QUEUE_TARGET_BASE_URL;
  if (explicit) return explicit;
  const host = process.env.VERCEL_URL;
  if (host) return `https://${host}`;
  return "http://localhost:3000";
}
```

Again, configure the queue to call this worker. Ensure retries/backoff are enabled.

---

## Webhook Receivers

### Better Auth (`src/app/api/webhooks/payload/route.ts`)

```ts
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { auth } from "@/lib/auth";

function verify(body: string, signature: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");
  const origin = request.headers.get("x-webhook-origin");
  if (!signature || !timestamp || origin !== "payload") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = env.PAYLOAD_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] PAYLOAD_INBOUND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const bodyText = await request.text();
  if (!verify(bodyText, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const age = Date.now() - Number(timestamp);
  if (Number.isFinite(age) && age > 5 * 60_000) {
    return NextResponse.json({ error: "Webhook expired" }, { status: 400 });
  }

  const event = JSON.parse(bodyText) as {
    id: string;
    origin: "payload";
    type: "user.updated" | "user.deleted";
    timestamp: number;
    data: { betterAuthUserId: string; email?: string; fullName?: string };
  };

  const headers = new Headers({
    "x-better-auth-user-id": event.data.betterAuthUserId,
    "x-webhook-origin": "payload",
  });

  try {
    if (event.type === "user.updated") {
      await auth.api.updateUser({
        headers,
        body: {
          ...(event.data.email ? { email: event.data.email } : {}),
          ...(event.data.fullName ? { name: event.data.fullName } : {}),
        },
      });
    } else if (event.type === "user.deleted") {
      await auth.api.deleteUser({
        headers,
        body: { requirePassword: false },
      });
    } else {
      return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    }
  } catch (err) {
    console.error("[webhook] Failed to apply payload event", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

Payload’s `/api/webhooks/better-auth` receiver mirrors this: verify signature, set `req.context.betterAuthOrigin = "better-auth"`, update/delete the user.

---

## Environment Variables

| Variable | Better Auth | Payload | Notes |
|----------|-------------|---------|-------|
| `QSTASH_TOKEN` | ✅ | ✅ | Publish token for QStash. |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | ✅ | ✅ | Used by worker routes to verify QStash signatures. |
| `QUEUE_TARGET_BASE_URL` (optional) | ✅ | ✅ | Override for custom domains or local tunnels; otherwise `https://${VERCEL_URL}` is used. |
| `VERCEL_URL` | ✅ | ✅ | Injected by Vercel; fallback for target URL resolution. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | ✅ | ✅ | Redis client credentials for idempotency store. |
| `PAYLOAD_WEBHOOK_URL`, `PAYLOAD_OUTBOUND_WEBHOOK_SECRET` | ✅ | | HMAC secret for Payload’s receiver. |
| `PAYLOAD_INBOUND_WEBHOOK_SECRET` | ✅ | | Secret for verifying Payload-origin webhooks. |
| `BETTER_AUTH_WEBHOOK_URL`, `BETTER_AUTH_OUTBOUND_WEBHOOK_SECRET` | | ✅ | HMAC secret for Better Auth’s receiver. |
| `BETTER_AUTH_INBOUND_WEBHOOK_SECRET` | | ✅ | Secret for verifying Better Auth-origin webhooks. |

Use strong secrets (32+ bytes) and store them in the respective secret managers.

## Origin & Idempotency Strategy

- Every payload carries a unique `id` and `origin`. Receivers set a request-scoped flag (e.g., `req.context.betterAuthOrigin = "payload"` or `"better-auth"`) before mutating data so outbound hooks skip re-emission.  
- Store processed webhook IDs in a shared store (e.g., Upstash Redis). Call `SADD webhooks:processed <id>`; if it returns `0`, treat it as a duplicate. Expire entries after 24–48 h.  
- Mutations must be idempotent: updates overwrite state, deletes tolerate already-removed records.

## Deployment & Environment Notes

| Environment | Base URL Resolution | Required Configuration |
|-------------|---------------------|------------------------|
| Production  | `QUEUE_TARGET_BASE_URL` (recommended) or `https://${VERCEL_URL}` | Set `QUEUE_TARGET_BASE_URL` to your custom domain (`https://auth.example.com`). |
| Preview     | `https://${VERCEL_URL}` | No extra config; each preview deployment has isolated queue endpoints. |
| Development | `QUEUE_TARGET_BASE_URL=http://localhost:3000` (Better Auth) / `http://localhost:3001` (Payload) | Use local tunnels (ngrok) if QStash must reach your machine. |

Worker routes verify the exact URL provided to `publishJSON`, so always resolve targets via helper functions rather than hard-coded strings.

## Operational Considerations

- **Retry strategy**: QStash retries automatically (`retries` option); monitor failed deliveries via the Upstash dashboard.  
- **Loop guard**: rely on `origin` flags and the request-scoped `betterAuthOrigin` flag to prevent replay loops.  
- **Observability**: log `webhookId`, user IDs, status codes. Monitor queue depth and worker errors.  
- **Testing**: integration tests covering create/update/delete in both directions.  
- **Failover**: ensure webhooks are idempotent; use the persisted `webhookId` store to dedupe.

## Technical Checklist

- [ ] Install `@upstash/qstash` and configure tokens/signing keys for each project.  
- [ ] Provide `QUEUE_TARGET_BASE_URL` overrides where custom domains or tunnels are used; rely on `VERCEL_URL` otherwise.  
- [ ] Implement worker routes with Upstash signature verification and outbound HMAC signing.  
- [ ] Persist processed webhook IDs (Redis/DB) to guarantee idempotency.  
- [ ] Instrument logging/metrics and monitor the Upstash dashboard for failures.  
- [ ] Validate preview deployments to ensure queue URLs resolve correctly.

With this queue-based approach Better Auth and Payload stay synchronized without sharing database credentials or blocking transactions, and you retain full control over retry & monitoring behavior.
