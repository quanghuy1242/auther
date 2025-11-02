import { emitWebhookEvent } from "@/lib/webhooks/delivery-service";
import type { WebhookEventType } from "@/lib/constants";

/**
 * Entity-to-webhook event type mapping
 * Define which webhook events should be emitted for each entity type
 */
export interface WebhookEventMapping {
  created?: WebhookEventType;
  updated?: WebhookEventType;
  deleted?: WebhookEventType;
}

/**
 * Configuration for webhook-aware repositories
 */
export interface WebhookAwareConfig {
  entityName: string;
  eventMapping: WebhookEventMapping;
  getUserId: (data: unknown) => string; // Extract userId from entity data
}

/**
 * Base class for repositories that emit webhook events
 * 
 * @example
 * class UserRepository extends WebhookAwareRepository {
 *   constructor() {
 *     super({
 *       entityName: 'user',
 *       eventMapping: {
 *         created: 'user.created',
 *         updated: 'user.updated',
 *         deleted: 'user.deleted',
 *       },
 *       getUserId: (data) => data.id,
 *     });
 *   }
 * }
 */
export abstract class WebhookAwareRepository {
  protected config: WebhookAwareConfig;

  constructor(config: WebhookAwareConfig) {
    this.config = config;
  }

  /**
   * Emit a webhook event after an entity operation
   * 
   * @param operation - The operation type (created, updated, deleted)
   * @param data - The entity data
   * @param options - Optional parameters like silent mode
   */
  protected async emitWebhook(
    operation: keyof WebhookEventMapping,
    data: unknown,
    options: { silent?: boolean } = {}
  ): Promise<void> {
    if (options.silent) {
      return;
    }

    const eventType = this.config.eventMapping[operation];
    if (!eventType) {
      return;
    }

    try {
      const userId = this.config.getUserId(data);
      await emitWebhookEvent(userId, eventType, data as Record<string, unknown>);
    } catch (error) {
      console.error(`[${this.config.entityName}] Failed to emit ${operation} webhook:`, error);
      // Don't throw - webhook emission should not break the main operation
    }
  }

  /**
   * Wrapper for create operations with automatic webhook emission
   */
  protected async createWithWebhook<T>(
    createFn: () => Promise<T>,
    options: { silent?: boolean } = {}
  ): Promise<T> {
    const result = await createFn();
    await this.emitWebhook("created", result, options);
    return result;
  }

  /**
   * Wrapper for update operations with automatic webhook emission
   */
  protected async updateWithWebhook<T>(
    updateFn: () => Promise<T | null>,
    options: { silent?: boolean } = {}
  ): Promise<T | null> {
    const result = await updateFn();
    if (result) {
      await this.emitWebhook("updated", result, options);
    }
    return result;
  }

  /**
   * Wrapper for delete operations with automatic webhook emission
   * Note: Pass the entity data before deletion since it won't exist after
   */
  protected async deleteWithWebhook<T>(
    entityData: T,
    deleteFn: () => Promise<boolean>,
    options: { silent?: boolean } = {}
  ): Promise<boolean> {
    const result = await deleteFn();
    if (result) {
      await this.emitWebhook("deleted", entityData, options);
    }
    return result;
  }
}
