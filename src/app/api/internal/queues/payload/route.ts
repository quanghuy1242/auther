import crypto from "node:crypto";

import { Receiver } from "@upstash/qstash";
import { Redis } from "@upstash/redis";

import { env } from "@/env";
import { resolveQueueBaseUrl, type PayloadWebhookEvent } from "@/lib/webhooks/payload";

const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY ?? env.QSTASH_CURRENT_SIGNING_KEY,
});

const redis = Redis.fromEnv();

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get("Upstash-Signature") ?? request.headers.get("upstash-signature");

  if (!signature) {
    return new Response("missing-signature", { status: 400 });
  }

  const expectedUrl = `${resolveQueueBaseUrl()}/api/internal/queues/payload`;

  try {
    await receiver.verify({
      signature,
      body,
      url: expectedUrl,
    });
  } catch (error) {
    console.error("[qstash] Failed to verify payload queue signature", error);
    return new Response("invalid-signature", { status: 401 });
  }

  let event: PayloadWebhookEvent;
  try {
    event = JSON.parse(body) as PayloadWebhookEvent;
  } catch (error) {
    console.error("[qstash] Invalid payload queue body", error);
    return new Response("invalid-body", { status: 400 });
  }

  try {
    const added = await redis.sadd("webhooks:processed", event.id);
    if (added === 0) {
      return new Response("duplicate", { status: 200 });
    }
    await redis.expire("webhooks:processed", 60 * 60 * 48);
  } catch (error) {
    console.error("[webhook] Failed to record payload webhook idempotency", {
      webhookId: event.id,
      error,
    });
    return new Response("idempotency-error", { status: 500 });
  }

  try {
    const response = await fetch(env.PAYLOAD_WEBHOOK_URL, {
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

    if (!response.ok) {
      console.error("[webhook] Payload webhook responded with error", {
        webhookId: event.id,
        status: response.status,
      });
      return new Response("payload-error", { status: 502 });
    }
  } catch (error) {
    console.error("[webhook] Failed to deliver payload webhook", {
      webhookId: event.id,
      error,
    });
    return new Response("delivery-error", { status: 500 });
  }

  return new Response("delivered", { status: 200 });
}

function createSignature(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
