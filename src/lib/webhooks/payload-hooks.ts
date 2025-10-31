// TODO: DEPRECATE - This file is part of the old single env-based webhook system.
// Use src/lib/webhooks/better-auth-hooks.ts instead for the new multi-webhook system.
// This file can be removed once all users migrate to the UI-based webhook management.

import { randomUUID } from "node:crypto";

import type { BetterAuthOptions } from "better-auth";

import {
  enqueuePayloadWebhook,
  mapUserToPayload,
  type PayloadUserInput,
  type PayloadWebhookEventType,
} from "@/lib/webhooks/payload";
import { isPayloadOrigin, type RequestWithContext } from "@/lib/webhooks/request";
import { WEBHOOK_ORIGIN_BETTER_AUTH } from "@/lib/constants";

type DatabaseHooks = NonNullable<BetterAuthOptions["databaseHooks"]>;
type UserHooks = NonNullable<DatabaseHooks["user"]>;
type HookContext = { request?: Request } | undefined;

export function createPayloadUserHooks(): UserHooks {
  return {
    create: {
      after: async (user, ctx) => {
        if (!shouldPropagate(user, ctx)) {
          return;
        }

        await emitPayloadEvent("user.created", user as PayloadUserInput);
      },
    },
    update: {
      after: async (user, ctx) => {
        if (!shouldPropagate(user, ctx)) {
          return;
        }

        await emitPayloadEvent("user.updated", user as PayloadUserInput);
      },
    },
    delete: {
      after: async (user, ctx) => {
        if (!shouldPropagate(user, ctx)) {
          return;
        }

        await emitPayloadEvent("user.deleted", user as PayloadUserInput);
      },
    },
  } satisfies UserHooks;
}

function shouldPropagate(user: unknown, ctx?: HookContext) {
  if (!user) {
    return false;
  }

  const request = ctx?.request as RequestWithContext | undefined;
  return !isPayloadOrigin(request);
}

async function emitPayloadEvent(type: PayloadWebhookEventType, user: PayloadUserInput) {
  const event = {
    id: randomUUID(),
    origin: WEBHOOK_ORIGIN_BETTER_AUTH,
    type,
    timestamp: Date.now(),
    data: mapUserToPayload(user),
  };

  try {
    await enqueuePayloadWebhook(event);
  } catch (error) {
    console.error("[webhook] Failed to enqueue payload event", {
      type,
      userId: user.id,
      error,
    });
  }
}
