import { Receiver } from "@upstash/qstash";
import { env } from "@/env";
import { QSTASH_SIGNATURE_HEADER } from "@/lib/constants";
import {
  deliverWebhook,
  recordDeliveryResult,
  type WebhookDeliveryJob,
} from "@/lib/webhooks/delivery-service";
import { webhookRepository } from "@/lib/repositories";

const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY ?? env.QSTASH_CURRENT_SIGNING_KEY,
});

/**
 * Verify QStash signature
 */
async function verifyQStashSignature(
  body: string,
  signature: string,
  url: string
): Promise<void> {
  await receiver.verify({
    signature,
    body,
    url,
  });
}

/**
 * Parse webhook delivery job from request body
 */
function parseDeliveryJob(body: string): WebhookDeliveryJob {
  return JSON.parse(body) as WebhookDeliveryJob;
}

/**
 * Find existing delivery record by eventId and endpointId
 */
async function findDeliveryRecord(
  eventId: string,
  endpointId: string
): Promise<string | null> {
  try {
    // Query deliveries for this event and endpoint
    const result = await webhookRepository.getDeliveryHistory(endpointId, 1, 100);
    const delivery = result.items.find((d) => d.eventId === eventId);
    return delivery?.id || null;
  } catch (error) {
    console.error("Failed to find delivery record:", { eventId, endpointId, error });
    return null;
  }
}

/**
 * POST /api/internal/queues/webhook-delivery
 * Queue worker that processes webhook delivery jobs from QStash
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get(QSTASH_SIGNATURE_HEADER);

  // Verify QStash signature
  if (!signature) {
    console.error("[webhook-delivery] Missing QStash signature");
    return new Response("missing-signature", { status: 400 });
  }

  try {
    await verifyQStashSignature(body, signature, request.url);
  } catch (error) {
    console.error("[webhook-delivery] Invalid QStash signature:", error);
    return new Response("invalid-signature", { status: 401 });
  }

  // Parse job
  let job: WebhookDeliveryJob;
  try {
    job = parseDeliveryJob(body);
  } catch (error) {
    console.error("[webhook-delivery] Invalid job body:", error);
    return new Response("invalid-body", { status: 400 });
  }

  const { eventId, endpointId } = job;

  // Find delivery record
  const deliveryId = await findDeliveryRecord(eventId, endpointId);
  if (!deliveryId) {
    console.error("[webhook-delivery] Delivery record not found:", {
      eventId,
      endpointId,
    });
    return new Response("delivery-record-not-found", { status: 404 });
  }

  // Get current attempt count
  const deliveryHistory = await webhookRepository.getDeliveryHistory(endpointId, 1, 1);
  const currentDelivery = deliveryHistory.items.find((d) => d.id === deliveryId);
  const attemptCount = (currentDelivery?.attemptCount || 0) + 1;

  // Deliver webhook
  console.log("[webhook-delivery] Delivering webhook:", {
    eventId,
    endpointId,
    deliveryId,
    attemptCount,
  });

  const result = await deliverWebhook(eventId, endpointId);

  // Record result
  await recordDeliveryResult(deliveryId, result, attemptCount);

  if (result.success) {
    console.log("[webhook-delivery] Delivery successful:", {
      eventId,
      endpointId,
      responseCode: result.responseCode,
      durationMs: result.durationMs,
    });
    return new Response("delivered", { status: 200 });
  } else {
    console.error("[webhook-delivery] Delivery failed:", {
      eventId,
      endpointId,
      responseCode: result.responseCode,
      attemptCount,
    });

    // Return 500 to trigger QStash retry (if retry policy allows)
    return new Response("delivery-failed", { status: 500 });
  }
}
