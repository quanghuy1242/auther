import { Client } from "@upstash/qstash";
import { env } from "@/env";
import { WebhookRepository } from "@/lib/repositories/webhook-repository";
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
  WEBHOOK_ORIGIN_AUTHER,
  WEBHOOK_ORIGIN_BETTER_AUTH,
  type WebhookEventType,
} from "@/lib/constants";
import type { WebhookDeliveryStatus } from "@/lib/types";
import { metricsService } from "@/lib/services/metrics-service";

const qstash = new Client({
  token: env.QSTASH_TOKEN,
  // Use local QStash dev server in development (Docker: http://qstash:8080)
  baseUrl: env.QSTASH_URL ?? "http://qstash:8080",
});

const webhookRepository = new WebhookRepository();

// ============================================================================
// Types
// ============================================================================

export type WebhookOrigin =
  | typeof WEBHOOK_ORIGIN_BETTER_AUTH
  | typeof WEBHOOK_ORIGIN_AUTHER;

export interface WebhookEventPayload {
  id: string;
  origin: WebhookOrigin;
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

function resolveOriginForEventType(eventType: WebhookEventType): WebhookOrigin {
  if (eventType.startsWith("grant.") || eventType.startsWith("group.")) {
    return WEBHOOK_ORIGIN_AUTHER;
  }

  return WEBHOOK_ORIGIN_BETTER_AUTH;
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
  const emitStart = performance.now();
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
      return;
    }

    // Metric: webhook event emission
    void metricsService.count("webhook.emit.count", endpoints.length, { event_type: eventType });

    // Enqueue delivery jobs for each endpoint
    const queuePromises = endpoints.map(async (endpoint) => {
      const deliveryId = generateWebhookDeliveryId();

      // Create initial delivery record
      const delivery = await webhookRepository.createDelivery({
        id: deliveryId,
        eventId,
        endpointId: endpoint.id,
        status: "pending",
        attemptCount: 0,
      });

      if (!delivery) {
        throw new Error(`Failed to create webhook delivery record for endpoint ${endpoint.id}`);
      }

      // Enqueue job via QStash
      const job: WebhookDeliveryJob = {
        eventId,
        endpointId: endpoint.id,
      };

      const queueUrl = resolveWebhookDeliveryQueueUrl();

      try {
        const result = await qstash.publishJSON({
          url: queueUrl,
          body: job,
          retries: endpoint.retryPolicy === "none" ? 0 : 3,
        });
        return result;
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "QStash publish failed";
        const errCause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
        await webhookRepository.updateDelivery(deliveryId, {
          status: "failed",
          attemptCount: 1,
          responseBody: (errCause ? `${errMessage}: ${errCause}` : errMessage).slice(0, 1000),
        });

        // Metric: QStash publish error
        void metricsService.count("qstash.publish.error.count", 1);
        throw err;
      }
    });

    const queueResults = await Promise.allSettled(queuePromises);
    const failedResults = queueResults.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    const failedQueueCount = failedResults.length;

    if (failedQueueCount > 0) {
      void metricsService.count("webhook.emit.queue_failed.count", failedQueueCount, {
        event_type: eventType,
      });
      console.error("Failed to enqueue webhook deliveries:", {
        eventId,
        eventType,
        failedQueueCount,
        totalEndpoints: endpoints.length,
        errors: failedResults.map((r) => {
          if (!(r.reason instanceof Error)) return String(r.reason);
          const cause = r.reason.cause instanceof Error ? ` (cause: ${r.reason.cause.message})` : "";
          return `${r.reason.message}${cause}`;
        }),
      });
    }

    // Metric: emit duration
    const emitDuration = performance.now() - emitStart;
    void metricsService.histogram("webhook.emit.duration_ms", emitDuration, { event_type: eventType });
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

    // Guard: Skip delivery if endpoint has no URL configured
    if (!endpoint.url || endpoint.url.trim() === "") {
      console.error("Endpoint has no URL configured:", endpointId);
      return { success: false, status: "failed" };
    }

    // Decrypt secret
    const secret = decryptSecret(endpoint.encryptedSecret);
    const eventType = event.type as WebhookEventType;
    const origin = resolveOriginForEventType(eventType);

    // Build payload
    const payload: WebhookEventPayload = {
      id: event.id,
      origin,
      type: eventType,
      timestamp: event.createdAt.getTime(),
      data: event.payload,
    };

    const isJsonDelivery = endpoint.deliveryFormat === "json";
    const body = isJsonDelivery
      ? JSON.stringify(payload)
      : new URLSearchParams({
        id: payload.id,
        origin: payload.origin,
        type: payload.type,
        timestamp: payload.timestamp.toString(),
        data: JSON.stringify(payload.data),
      }).toString();
    const signature = createWebhookSignature(body, secret);

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type":
        isJsonDelivery
          ? "application/json"
          : "application/x-www-form-urlencoded",
      [WEBHOOK_SIGNATURE_HEADER]: signature,
      [WEBHOOK_ID_HEADER]: event.id,
      [WEBHOOK_TIMESTAMP_HEADER]: payload.timestamp.toString(),
      [WEBHOOK_ORIGIN_HEADER]: origin,
    };

    // Make request
    const response = await fetch(endpoint.url, {
      method: endpoint.requestMethod,
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const durationMs = Date.now() - startTime;
    const responseCode = response.status;
    const responseBody = await response.text().catch(() => "");

    // Determine status
    const success = response.ok;
    const status: WebhookDeliveryStatus = success ? "success" : "failed";

    // Metric: delivery completed
    void metricsService.histogram("webhook.delivery.duration_ms", durationMs, { status, response_code: String(responseCode) });

    return {
      success,
      status,
      responseCode,
      responseBody: responseBody.substring(0, 1000), // Trim to 1KB
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined;
    console.error("Webhook delivery error:", {
      eventId,
      endpointId,
      error,
      cause,
    });

    const message = error instanceof Error ? error.message : "Unknown error";
    const causeMessage = cause?.message;
    return {
      success: false,
      status: "failed",
      responseBody: causeMessage ? `${message}: ${causeMessage}` : message,
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
