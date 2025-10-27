import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { auth } from "@/lib/auth";

function verifySignature(body: string, signature: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const provided = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (provided.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expectedBuffer);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-webhook-signature");
  const timestampHeader = request.headers.get("x-webhook-timestamp");
  const origin = request.headers.get("x-webhook-origin");

  if (!signature || !timestampHeader || origin !== "payload") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = env.PAYLOAD_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] PAYLOAD_INBOUND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const bodyText = await request.text();

  if (!verifySignature(bodyText, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  const age = Date.now() - timestamp;
  if (age > 5 * 60_000) {
    return NextResponse.json({ error: "Webhook expired" }, { status: 400 });
  }

  let event:
    | {
        id: string;
        origin: "payload";
        type: "user.updated";
        timestamp: number;
        data: { betterAuthUserId: string; email?: string; fullName?: string };
      }
    | {
        id: string;
        origin: "payload";
        type: "user.deleted";
        timestamp: number;
        data: { betterAuthUserId: string };
      };

  try {
    event = JSON.parse(bodyText);
  } catch (error) {
    console.error("[webhook] Invalid payload webhook body", error);
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (event.origin !== "payload") {
    return NextResponse.json({ error: "Invalid origin" }, { status: 401 });
  }

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
        body: {},
      });
    } else {
      return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    }
  } catch (error) {
    console.error("[webhook] Failed to apply payload event", {
      eventId: event.id,
      error,
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
