import { Receiver } from "@upstash/qstash";
import { Redis } from "@upstash/redis";

import { env } from "@/env";
import {
  PROCESSED_WEBHOOK_SET_KEY,
  QSTASH_SIGNATURE_HEADER,
  WEBHOOK_ID_HEADER,
  WEBHOOK_ORIGIN_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_IDEMPOTENCY_TTL_SECONDS,
} from "@/lib/constants";
import { resolveQueueTargetUrl, type PayloadWebhookEvent } from "@/lib/webhooks/payload";
import { createWebhookSignature } from "@/lib/webhooks/signature";

const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY ?? env.QSTASH_CURRENT_SIGNING_KEY,
});

const redis = Redis.fromEnv();

async function verifyQStashSignature(body: string, signature: string): Promise<void> {
  const expectedUrl = resolveQueueTargetUrl();
  
  await receiver.verify({
    signature,
    body,
    url: expectedUrl,
  });
}

async function parseWebhookEvent(body: string): Promise<PayloadWebhookEvent> {
  return JSON.parse(body) as PayloadWebhookEvent;
}

async function ensureIdempotency(eventId: string): Promise<boolean> {
  const added = await redis.sadd(PROCESSED_WEBHOOK_SET_KEY, eventId);
  
  if (added === 0) {
    return false; // Already processed
  }
  
  await redis.expire(PROCESSED_WEBHOOK_SET_KEY, WEBHOOK_IDEMPOTENCY_TTL_SECONDS);
  return true;
}

async function deliverWebhookToPayload(event: PayloadWebhookEvent, body: string): Promise<void> {
  const response = await fetch(env.PAYLOAD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [WEBHOOK_SIGNATURE_HEADER]: createWebhookSignature(body, env.PAYLOAD_OUTBOUND_WEBHOOK_SECRET),
      [WEBHOOK_ID_HEADER]: event.id,
      [WEBHOOK_TIMESTAMP_HEADER]: event.timestamp.toString(),
      [WEBHOOK_ORIGIN_HEADER]: event.origin,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Payload webhook responded with error: ${response.status}`);
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get(QSTASH_SIGNATURE_HEADER);

  if (!signature) {
    return new Response("missing-signature", { status: 400 });
  }

  try {
    await verifyQStashSignature(body, signature);
  } catch (error) {
    console.error("[qstash] Failed to verify payload queue signature", error);
    return new Response("invalid-signature", { status: 401 });
  }

  let event: PayloadWebhookEvent;
  try {
    event = await parseWebhookEvent(body);
  } catch (error) {
    console.error("[qstash] Invalid payload queue body", error);
    return new Response("invalid-body", { status: 400 });
  }

  try {
    const isNew = await ensureIdempotency(event.id);
    if (!isNew) {
      return new Response("duplicate", { status: 200 });
    }
  } catch (error) {
    console.error("[webhook] Failed to record payload webhook idempotency", {
      webhookId: event.id,
      error,
    });
    return new Response("idempotency-error", { status: 500 });
  }

  try {
    await deliverWebhookToPayload(event, body);
  } catch (error) {
    console.error("[webhook] Failed to deliver payload webhook", {
      webhookId: event.id,
      error,
    });
    return new Response("delivery-error", { status: 500 });
  }

  return new Response("delivered", { status: 200 });
}
