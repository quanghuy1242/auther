"use server";

import { requireAdmin } from "@/lib/session";
import { webhookRepository, userRepository } from "@/lib/repositories";
import {
  encryptSecret,
  decryptSecret,
  generateWebhookSecret,
  generateWebhookId,
} from "@/lib/utils/encryption";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type {
  WebhookEndpointWithSubscriptions,
  WebhookDeliveryEntity,
  WebhookDeliveryStats,
  WebhookRetryPolicy,
  WebhookDeliveryFormat,
  WebhookRequestMethod,
} from "@/lib/types";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@/lib/constants";

// Re-export types for client components
export type {
  WebhookEndpointWithSubscriptions,
  WebhookDeliveryEntity,
  WebhookDeliveryStats,
};

// ============================================================================
// Result Types
// ============================================================================

export interface GetWebhooksResult {
  webhooks: WebhookEndpointWithSubscriptions[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GetDeliveryHistoryResult {
  deliveries: WebhookDeliveryEntity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface WebhookFormState {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
  data?: {
    id: string;
    secret?: string; // Only populated on create/regenerate for one-time reveal
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

const webhookSchema = z.object({
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(100, "Display name must be less than 100 characters"),
  url: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) => {
        // Allow HTTPS, localhost, and Docker network URLs (e.g., http://webhook-tester:8080)
        return (
          url.startsWith("https://") || 
          url.startsWith("http://localhost") ||
          url.startsWith("http://127.0.0.1") ||
          /^http:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*:[0-9]+/.test(url) // Docker service names with port
        );
      },
      "URL must use HTTPS or be a valid local/Docker network URL (http://localhost, http://service-name:port)"
    ),
  isActive: z.boolean().default(true),
  eventTypes: z
    .array(z.string())
    .min(1, "At least one event type must be selected")
    .refine(
      (types) =>
        types.every((t) =>
          WEBHOOK_EVENT_TYPES.some((evt) => evt.value === t)
        ),
      "Invalid event type selected"
    ),
  retryPolicy: z.enum(["none", "standard", "aggressive"]).default("standard"),
  deliveryFormat: z.enum(["json", "form-encoded"]).default("json"),
  requestMethod: z.enum(["POST", "PUT"]).default("POST"),
});

// ============================================================================
// Query Actions
// ============================================================================

/**
 * Get paginated list of webhooks with subscriptions and last delivery info
 */
export async function getWebhooks(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "active" | "inactive";
  eventType?: string;
}): Promise<GetWebhooksResult> {
  try {
    const session = await requireAdmin();

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 10));

    const result = await webhookRepository.findManyWithSubscriptions(
      page,
      pageSize,
      {
        userId: session.user.id,
        search: params.search,
        isActive:
          params.status === "all" || !params.status
            ? undefined
            : params.status === "active",
        eventType:
          !params.eventType || params.eventType === "all"
            ? undefined
            : params.eventType,
      }
    );

    return {
      webhooks: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  } catch (error) {
    console.error("Failed to fetch webhooks:", error);
    return {
      webhooks: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }
}

/**
 * Get webhook by ID with subscriptions
 */
export async function getWebhookById(
  id: string
): Promise<WebhookEndpointWithSubscriptions | null> {
  try {
    const session = await requireAdmin();

    const webhook = await webhookRepository.findByIdWithSubscriptions(id);

    // Ensure user owns this webhook
    if (webhook && webhook.userId !== session.user.id) {
      console.error("Unauthorized access to webhook:", id);
      return null;
    }

    return webhook;
  } catch (error) {
    console.error("Failed to fetch webhook:", error);
    return null;
  }
}

/**
 * Get delivery history for a webhook
 */
export async function getDeliveryHistory(
  webhookId: string,
  params: {
    page?: number;
    pageSize?: number;
  }
): Promise<GetDeliveryHistoryResult> {
  try {
    const session = await requireAdmin();

    // Verify ownership
    const webhook = await webhookRepository.findById(webhookId);
    if (!webhook || webhook.userId !== session.user.id) {
      throw new Error("Webhook not found or unauthorized");
    }

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 25));

    const result = await webhookRepository.getDeliveryHistory(
      webhookId,
      page,
      pageSize
    );

    return {
      deliveries: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  } catch (error) {
    console.error("Failed to fetch delivery history:", error);
    return {
      deliveries: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 0,
    };
  }
}

/**
 * Get delivery statistics (last 7 days)
 */
export async function getDeliveryStats(): Promise<WebhookDeliveryStats> {
  try {
    const session = await requireAdmin();
    return await webhookRepository.getDeliveryStats(session.user.id);
  } catch (error) {
    console.error("Failed to fetch delivery stats:", error);
    return {
      successRate: 0,
      trend: 0,
      dailyData: [],
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
    };
  }
}

// ============================================================================
// Mutation Actions
// ============================================================================

/**
 * Create a new webhook endpoint
 */
export async function createWebhook(
  prevState: WebhookFormState,
  formData: FormData
): Promise<WebhookFormState> {
  try {
    const session = await requireAdmin();

    // Parse and validate form data
    const eventTypesRaw = formData.get("eventTypes");
    const eventTypes = eventTypesRaw ? JSON.parse(eventTypesRaw as string) : [];

    const result = webhookSchema.safeParse({
      displayName: formData.get("displayName"),
      url: formData.get("url"),
      isActive: formData.get("isActive") === "true",
      eventTypes,
      retryPolicy: formData.get("retryPolicy") || "standard",
      deliveryFormat: formData.get("deliveryFormat") || "json",
      requestMethod: formData.get("requestMethod") || "POST",
    });

    if (!result.success) {
      return {
        success: false,
        errors: result.error.flatten().fieldErrors as Record<string, string>,
      };
    }

    const data = result.data;

    // Generate ID and secret
    const id = generateWebhookId();
    const plainSecret = generateWebhookSecret();
    const encryptedSecret = encryptSecret(plainSecret);

    // Create endpoint
    const endpoint = await webhookRepository.create({
      id,
      userId: session.user.id,
      displayName: data.displayName,
      url: data.url,
      encryptedSecret,
      isActive: data.isActive,
      retryPolicy: data.retryPolicy as WebhookRetryPolicy,
      deliveryFormat: data.deliveryFormat as WebhookDeliveryFormat,
      requestMethod: data.requestMethod as WebhookRequestMethod,
    });

    if (!endpoint) {
      return {
        success: false,
        error: "Failed to create webhook endpoint",
      };
    }

    // Add subscriptions
    const subscribed = await webhookRepository.addSubscriptions(
      id,
      data.eventTypes
    );

    if (!subscribed) {
      // Rollback: delete the endpoint
      await webhookRepository.delete(id);
      return {
        success: false,
        error: "Failed to create webhook subscriptions",
      };
    }

    revalidatePath("/admin/webhooks");

    return {
      success: true,
      data: {
        id,
        secret: plainSecret, // Return for one-time reveal
      },
    };
  } catch (error) {
    console.error("Failed to create webhook:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Update an existing webhook endpoint
 */
export async function updateWebhook(
  webhookId: string,
  prevState: WebhookFormState,
  formData: FormData
): Promise<WebhookFormState> {
  try {
    const session = await requireAdmin();

    // Verify ownership
    const existing = await webhookRepository.findById(webhookId);
    if (!existing || existing.userId !== session.user.id) {
      return {
        success: false,
        error: "Webhook not found or unauthorized",
      };
    }

    // Parse and validate form data
    const eventTypesRaw = formData.get("eventTypes");
    const eventTypes = eventTypesRaw ? JSON.parse(eventTypesRaw as string) : [];

    const result = webhookSchema.safeParse({
      displayName: formData.get("displayName"),
      url: formData.get("url"),
      isActive: formData.get("isActive") === "true",
      eventTypes,
      retryPolicy: formData.get("retryPolicy") || "standard",
      deliveryFormat: formData.get("deliveryFormat") || "json",
      requestMethod: formData.get("requestMethod") || "POST",
    });

    if (!result.success) {
      return {
        success: false,
        errors: result.error.flatten().fieldErrors as Record<string, string>,
      };
    }

    const data = result.data;

    // Update endpoint
    const updated = await webhookRepository.update(webhookId, {
      displayName: data.displayName,
      url: data.url,
      isActive: data.isActive,
      retryPolicy: data.retryPolicy as WebhookRetryPolicy,
      deliveryFormat: data.deliveryFormat as WebhookDeliveryFormat,
      requestMethod: data.requestMethod as WebhookRequestMethod,
    });

    if (!updated) {
      return {
        success: false,
        error: "Failed to update webhook endpoint",
      };
    }

    // Replace subscriptions
    const subscribed = await webhookRepository.replaceSubscriptions(
      webhookId,
      data.eventTypes
    );

    if (!subscribed) {
      return {
        success: false,
        error: "Failed to update webhook subscriptions",
      };
    }

    revalidatePath("/admin/webhooks");
    revalidatePath(`/admin/webhooks/${webhookId}`);

    return {
      success: true,
      data: { id: webhookId },
    };
  } catch (error) {
    console.error("Failed to update webhook:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Delete a webhook endpoint
 */
export async function deleteWebhook(webhookId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await requireAdmin();

    // Verify ownership
    const existing = await webhookRepository.findById(webhookId);
    if (!existing || existing.userId !== session.user.id) {
      return {
        success: false,
        error: "Webhook not found or unauthorized",
      };
    }

    const deleted = await webhookRepository.delete(webhookId);

    if (!deleted) {
      return {
        success: false,
        error: "Failed to delete webhook",
      };
    }

    revalidatePath("/admin/webhooks");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete webhook:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Regenerate webhook secret
 */
export async function regenerateSecret(webhookId: string): Promise<{
  success: boolean;
  error?: string;
  secret?: string;
}> {
  try {
    const session = await requireAdmin();

    // Verify ownership
    const existing = await webhookRepository.findById(webhookId);
    if (!existing || existing.userId !== session.user.id) {
      return {
        success: false,
        error: "Webhook not found or unauthorized",
      };
    }

    // Generate new secret
    const plainSecret = generateWebhookSecret();
    const encryptedSecret = encryptSecret(plainSecret);

    // Update endpoint
    const updated = await webhookRepository.update(webhookId, {
      encryptedSecret,
    });

    if (!updated) {
      return {
        success: false,
        error: "Failed to regenerate secret",
      };
    }

    revalidatePath(`/admin/webhooks/${webhookId}`);

    return {
      success: true,
      secret: plainSecret, // Return for one-time reveal
    };
  } catch (error) {
    console.error("Failed to regenerate secret:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Toggle webhook active status
 */
export async function toggleWebhookStatus(
  webhookId: string,
  isActive: boolean
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await requireAdmin();

    // Verify ownership
    const existing = await webhookRepository.findById(webhookId);
    if (!existing || existing.userId !== session.user.id) {
      return {
        success: false,
        error: "Webhook not found or unauthorized",
      };
    }

    const updated = await webhookRepository.update(webhookId, {
      isActive,
    });

    if (!updated) {
      return {
        success: false,
        error: "Failed to update webhook status",
      };
    }

    revalidatePath("/admin/webhooks");
    revalidatePath(`/admin/webhooks/${webhookId}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to toggle webhook status:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Get decrypted secret (for copy to clipboard)
 * Only returns secret if user owns the webhook
 */
export async function getDecryptedSecret(webhookId: string): Promise<{
  success: boolean;
  error?: string;
  secret?: string;
}> {
  try {
    const session = await requireAdmin();

    // Verify ownership
    const existing = await webhookRepository.findById(webhookId);
    if (!existing || existing.userId !== session.user.id) {
      return {
        success: false,
        error: "Webhook not found or unauthorized",
      };
    }

    // Decrypt secret
    const plainSecret = decryptSecret(existing.encryptedSecret);

    return {
      success: true,
      secret: plainSecret,
    };
  } catch (error) {
    console.error("Failed to decrypt secret:", error);
    return {
      success: false,
      error: "Failed to retrieve secret",
    };
  }
}

/**
 * Test a webhook by triggering a dummy user.updated event
 * This will send a real webhook delivery to the endpoint
 */
const SUPPORTED_TEST_EVENT: WebhookEventType = "user.updated";

/**
 * Test a webhook by emitting a synthetic event
 * This queues an event through the normal delivery pipeline
 */
export async function testWebhook(
  webhookId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const session = await requireAdmin();

    const webhook = await webhookRepository.findByIdWithSubscriptions(webhookId);
    if (!webhook || webhook.userId !== session.user.id) {
      return { success: false, error: "Webhook not found or unauthorized" };
    }

    if (!webhook.isActive) {
      return {
        success: false,
        error: "Cannot test an inactive webhook. Please enable it first.",
      };
    }

    const isSupported = webhook.subscriptions.some(
      (sub) => sub.eventType === SUPPORTED_TEST_EVENT
    );

    if (!isSupported) {
      return {
        success: false,
        error:
          "Test events currently require a subscription to 'user.updated'. Please add that event and try again.",
      };
    }

    const userRecord = await userRepository.findById(webhook.userId);
    if (!userRecord) {
      return {
        success: false,
        error: "Unable to load user profile for test payload",
      };
    }

    const { emitWebhookEvent } = await import("@/lib/webhooks/delivery-service");

    await emitWebhookEvent(webhook.userId, SUPPORTED_TEST_EVENT, {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name,
      emailVerified: userRecord.emailVerified,
      updatedAt: new Date().toISOString(),
      testEvent: true,
      note: "Webhook test triggered from admin UI",
      triggeredBy: session.user.id,
      triggeredAt: new Date().toISOString(),
    });

    return {
      success: true,
      message:
        "Test event queued. Deliveries may take a few seconds to appear in the history.",
    };
  } catch (error) {
    console.error("Failed to test webhook:", error);
    return {
      success: false,
      error: "An unexpected error occurred while testing webhook",
    };
  }
}
