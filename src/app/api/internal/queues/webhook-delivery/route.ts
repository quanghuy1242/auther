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
    // Use the URL that QStash used to send the request (from QUEUE_TARGET_BASE_URL)
    // Not request.url, which would be http://localhost:3000 instead of http://app:3000
    const queueBaseUrl = env.QUEUE_TARGET_BASE_URL ?? 
      (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined) ?? 
      "http://localhost:3000";
    const verifyUrl = `${queueBaseUrl}/api/internal/queues/webhook-delivery`;
    
    await verifyQStashSignature(body, signature, verifyUrl);
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
  const deliveryRecord = await webhookRepository.findDeliveryByEventAndEndpoint(
    eventId,
    endpointId
  );
  if (!deliveryRecord) {
    console.error("[webhook-delivery] Delivery record not found:", {
      eventId,
      endpointId,
    });
    return new Response("delivery-record-not-found", { status: 404 });
  }

  const attemptCount = (deliveryRecord.attemptCount ?? 0) + 1;

  // Deliver webhook
  const result = await deliverWebhook(eventId, endpointId);

  // Record result
  await recordDeliveryResult(deliveryRecord.id, result, attemptCount);

  if (result.success) {
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
