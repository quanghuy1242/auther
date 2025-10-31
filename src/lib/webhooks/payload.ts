// TODO: DEPRECATE - This file implements the old single env-based webhook system.
// It should be removed once all users migrate to the new multi-webhook UI system
// implemented in src/lib/webhooks/delivery-service.ts and src/app/admin/webhooks/
// Related files to deprecate:
// - src/lib/webhooks/payload-hooks.ts
// - src/app/api/internal/queues/payload/route.ts
// - PAYLOAD_WEBHOOK_URL and related env vars

import { Client } from "@upstash/qstash";

import { env } from "@/env";
import { 
  DEFAULT_LOCAL_BASE_URL, 
  PAYLOAD_QUEUE_PATH, 
  WEBHOOK_ORIGIN_BETTER_AUTH 
} from "@/lib/constants";

const qstash = new Client({
  token: env.QSTASH_TOKEN,
});

export type PayloadWebhookEventType = "user.created" | "user.updated" | "user.deleted";

export type PayloadWebhookUser = {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean;
  image?: string | null;
  username?: string | null;
  displayUsername?: string | null;
};

export type PayloadWebhookEvent = {
  id: string;
  origin: typeof WEBHOOK_ORIGIN_BETTER_AUTH;
  type: PayloadWebhookEventType;
  timestamp: number;
  data: PayloadWebhookUser;
};

export type PayloadUserInput = {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean | null;
  image?: string | null;
  username?: string | null;
  displayUsername?: string | null;
};

/**
 * Resolves the base URL for queue targets
 */
export function resolveQueueBaseUrl(): string {
  return (
    env.QUEUE_TARGET_BASE_URL ?? 
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined) ?? 
    DEFAULT_LOCAL_BASE_URL
  );
}

/**
 * Resolves the complete queue target URL
 */
export function resolveQueueTargetUrl(path = PAYLOAD_QUEUE_PATH): string {
  return `${resolveQueueBaseUrl()}${path}`;
}

/**
 * Maps user input to payload webhook user format
 */
export function mapUserToPayload(user: PayloadUserInput): PayloadWebhookUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    emailVerified: user.emailVerified ?? undefined,
    image: user.image ?? null,
    username: user.username ?? null,
    displayUsername: user.displayUsername ?? null,
  };
}

/**
 * Enqueues a payload webhook event via QStash
 */
export async function enqueuePayloadWebhook(event: PayloadWebhookEvent): Promise<void> {
  const targetUrl = resolveQueueTargetUrl();

  await qstash.publishJSON({
    url: targetUrl,
    body: event,
    retries: 3,
  });
}
