import { Client } from "@upstash/qstash";

import { env } from "@/env";

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
  origin: "better-auth";
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

export async function enqueuePayloadWebhook(event: PayloadWebhookEvent) {
  const targetUrl = resolveQueueTargetUrl("/api/internal/queues/payload");

  await qstash.publishJSON({
    url: targetUrl,
    body: event,
    retries: 3,
  });
}

export function resolveQueueTargetUrl(path: string) {
  return `${resolveQueueBaseUrl()}${path}`;
}

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

export function resolveQueueBaseUrl() {
  const explicitBase = env.QUEUE_TARGET_BASE_URL;
  if (explicitBase) {
    return explicitBase;
  }

  const vercelHost = env.VERCEL_URL;
  if (vercelHost) {
    return `https://${vercelHost}`;
  }

  return "http://localhost:3000";
}
