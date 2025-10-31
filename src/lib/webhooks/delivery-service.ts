import { Client } from "@upstash/qstash";
import { env } from "@/env";
import { webhookRepository } from "@/lib/repositories";
import {
  generateWebhookEventId,
  generateWebhookDeliveryId,
  decryptSecret,
} from "@/lib/utils/encryption";
import { createWebhookSignature } from "./signature";
import {
  DEFAULT_LOCAL_BASE_URL,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_ID_HEADER,
  WEBHOOK_ORIGIN_HEADER,
  WEBHOOK_ORIGIN_BETTER_AUTH,
  type WebhookEventType,
} from "@/lib/constants";
import type { WebhookDeliveryStatus } from "@/lib/types";

const qstash = new Client({
  token: env.QSTASH_TOKEN,
});

// ============================================================================
// Types
// ============================================================================

export interface WebhookEventPayload {
  id: string;
  origin: typeof WEBHOOK_ORIGIN_BETTER_AUTH;
  type: WebhookEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryJob {
  eventId: string;
  endpointId: string;
}

// ============================================================================
// URL Resolution
// ============================================================================

/**
 * Resolves the base URL for queue targets
 */
function resolveQueueBaseUrl(): string {
  return (
    env.QUEUE_TARGET_BASE_URL ??
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined) ??
    DEFAULT_LOCAL_BASE_URL
  );
}

/**
 * Resolves the complete queue target URL for webhook delivery
 */
function resolveWebhookDeliveryQueueUrl(): string {
  return `${resolveQueueBaseUrl()}/api/internal/queues/webhook-delivery`;
}

// ============================================================================
// Event Emission
// ============================================================================

/**
 * Emit a webhook event to all subscribed active endpoints
 * This is the main entry point called by Better Auth hooks
 *
 * @param userId - The user ID who triggered the event
 * @param eventType - The type of event (e.g., "user.created")
 * @param data - The event payload data
 */
export async function emitWebhookEvent(
  userId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // Generate event ID
    const eventId = generateWebhookEventId();

    // Create event record (audit log)
    const event = await webhookRepository.createEvent({
      id: eventId,
      userId,
      type: eventType,
      payload: data,
    });

    if (!event) {
      console.error("Failed to create webhook event record:", {
        userId,
        eventType,
      });
      return;
    }

    // Find all active endpoints subscribed to this event type
    const endpoints = await webhookRepository.findActiveEndpointsByEvent(
      userId,
      eventType
    );

    if (endpoints.length === 0) {
      console.log("No active endpoints subscribed to event:", {
        userId,
        eventType,
      });
      return;
    }

    // Enqueue delivery jobs for each endpoint
    const queuePromises = endpoints.map(async (endpoint) => {
      const deliveryId = generateWebhookDeliveryId();

      // Create initial delivery record
      await webhookRepository.createDelivery({
        id: deliveryId,
        eventId,
        endpointId: endpoint.id,
        status: "pending",
        attemptCount: 0,
      });

      // Enqueue job via QStash
      const job: WebhookDeliveryJob = {
        eventId,
        endpointId: endpoint.id,
      };

      await qstash.publishJSON({
        url: resolveWebhookDeliveryQueueUrl(),
        body: job,
        retries: endpoint.retryPolicy === "none" ? 0 : 3,
      });
    });

    await Promise.allSettled(queuePromises);

    console.log("Webhook event emitted:", {
      eventId,
      eventType,
      endpointCount: endpoints.length,
    });
  } catch (error) {
    console.error("Failed to emit webhook event:", {
      userId,
      eventType,
      error,
    });
  }
}

// ============================================================================
// Webhook Delivery
// ============================================================================

/**
 * Deliver a webhook to a specific endpoint
 * This is called by the queue worker
 *
 * @param eventId - The webhook event ID
 * @param endpointId - The webhook endpoint ID
 */
export async function deliverWebhook(
  eventId: string,
  endpointId: string
): Promise<{
  success: boolean;
  status: WebhookDeliveryStatus;
  responseCode?: number;
  responseBody?: string;
  durationMs?: number;
}> {
  const startTime = Date.now();

  try {
    // Load event
    const event = await webhookRepository.findEventById(eventId);
    if (!event) {
      console.error("Event not found:", eventId);
      return { success: false, status: "failed" };
    }

    // Load endpoint
    const endpoint = await webhookRepository.findById(endpointId);
    if (!endpoint) {
      console.error("Endpoint not found:", endpointId);
      return { success: false, status: "failed" };
    }

    // Decrypt secret
    const secret = decryptSecret(endpoint.encryptedSecret);

    // Build payload
    const payload: WebhookEventPayload = {
      id: event.id,
      origin: WEBHOOK_ORIGIN_BETTER_AUTH,
      type: event.type as WebhookEventType,
      timestamp: event.createdAt.getTime(),
      data: event.payload,
    };

    const body = JSON.stringify(payload);
    const signature = createWebhookSignature(body, secret);

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type":
        endpoint.deliveryFormat === "json"
          ? "application/json"
          : "application/x-www-form-urlencoded",
      [WEBHOOK_SIGNATURE_HEADER]: signature,
      [WEBHOOK_ID_HEADER]: event.id,
      [WEBHOOK_TIMESTAMP_HEADER]: payload.timestamp.toString(),
      [WEBHOOK_ORIGIN_HEADER]: WEBHOOK_ORIGIN_BETTER_AUTH,
    };

    // Make request
    const response = await fetch(endpoint.url, {
      method: endpoint.requestMethod,
      headers,
      body: endpoint.deliveryFormat === "json" ? body : new URLSearchParams(event.payload as Record<string, string>).toString(),
    });

    const durationMs = Date.now() - startTime;
    const responseCode = response.status;
    const responseBody = await response.text().catch(() => "");

    // Determine status
    const success = response.ok;
    const status: WebhookDeliveryStatus = success ? "success" : "failed";

    return {
      success,
      status,
      responseCode,
      responseBody: responseBody.substring(0, 1000), // Trim to 1KB
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("Webhook delivery error:", {
      eventId,
      endpointId,
      error,
    });

    return {
      success: false,
      status: "failed",
      responseBody: error instanceof Error ? error.message : "Unknown error",
      durationMs,
    };
  }
}

/**
 * Record delivery result in database
 *
 * @param deliveryId - The delivery record ID
 * @param result - The delivery result
 * @param attemptCount - The current attempt number
 */
export async function recordDeliveryResult(
  deliveryId: string,
  result: {
    success: boolean;
    status: WebhookDeliveryStatus;
    responseCode?: number;
    responseBody?: string;
    durationMs?: number;
  },
  attemptCount: number
): Promise<void> {
  try {
    await webhookRepository.updateDelivery(deliveryId, {
      status: result.status,
      attemptCount,
      responseCode: result.responseCode,
      responseBody: result.responseBody,
      durationMs: result.durationMs,
    });
  } catch (error) {
    console.error("Failed to record delivery result:", {
      deliveryId,
      error,
    });
  }
}
