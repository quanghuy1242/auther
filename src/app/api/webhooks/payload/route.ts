import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { auth } from "@/lib/auth";
import {
  BETTER_AUTH_USER_ID_HEADER,
  WEBHOOK_ORIGIN_HEADER,
  WEBHOOK_ORIGIN_PAYLOAD,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_MAX_AGE_MS,
} from "@/lib/constants";
import { verifyWebhookSignature } from "@/lib/webhooks/signature";
import { validateTimestamp } from "@/lib/utils/validation";

type PayloadWebhookEvent =
  | {
      id: string;
      origin: typeof WEBHOOK_ORIGIN_PAYLOAD;
      type: "user.updated";
      timestamp: number;
      data: { betterAuthUserId: string; email?: string; fullName?: string };
    }
  | {
      id: string;
      origin: typeof WEBHOOK_ORIGIN_PAYLOAD;
      type: "user.deleted";
      timestamp: number;
      data: { betterAuthUserId: string };
    };

function validateWebhookHeaders(request: NextRequest): { signature: string; timestamp: number } {
  const signature = request.headers.get(WEBHOOK_SIGNATURE_HEADER);
  const timestampHeader = request.headers.get(WEBHOOK_TIMESTAMP_HEADER);
  const origin = request.headers.get(WEBHOOK_ORIGIN_HEADER);

  if (!signature || !timestampHeader || origin !== WEBHOOK_ORIGIN_PAYLOAD) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const timestamp = Number(timestampHeader);
  if (!validateTimestamp(timestamp, WEBHOOK_MAX_AGE_MS)) {
    throw new Response(
      JSON.stringify({ error: "Invalid or expired timestamp" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return { signature, timestamp };
}

function validateSignature(bodyText: string, signature: string): void {
  const secret = env.PAYLOAD_INBOUND_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[webhook] PAYLOAD_INBOUND_WEBHOOK_SECRET not configured");
    throw new Response(
      JSON.stringify({ error: "Webhook not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!verifyWebhookSignature(bodyText, signature, secret)) {
    throw new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
}

function parseEvent(bodyText: string): PayloadWebhookEvent {
  try {
    const event = JSON.parse(bodyText) as PayloadWebhookEvent;

    if (event.origin !== WEBHOOK_ORIGIN_PAYLOAD) {
      throw new Error("Invalid origin");
    }

    return event;
  } catch (error) {
    console.error("[webhook] Invalid payload webhook body", error);
    throw new Response(
      JSON.stringify({ error: "Invalid body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function processEvent(event: PayloadWebhookEvent): Promise<void> {
  const headers = new Headers({
    [BETTER_AUTH_USER_ID_HEADER]: event.data.betterAuthUserId,
    [WEBHOOK_ORIGIN_HEADER]: WEBHOOK_ORIGIN_PAYLOAD,
  });

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
      body: {},
    });
  } else {
    throw new Response(
      JSON.stringify({ error: "Unknown event" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { signature } = validateWebhookHeaders(request);
    const bodyText = await request.text();

    validateSignature(bodyText, signature);

    const event = parseEvent(bodyText);

    await processEvent(event);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("[webhook] Failed to process payload event", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
