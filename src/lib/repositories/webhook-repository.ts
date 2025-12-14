import { db } from "@/lib/db";
import {
  webhookEndpoint,
  webhookSubscription,
  webhookEvent,
  webhookDelivery,
} from "@/db/app-schema";
import { desc, like, or, eq, count, sql, and, inArray } from "drizzle-orm";
import type {
  WebhookEndpointEntity,
  WebhookEndpointWithSubscriptions,
  WebhookEventEntity,
  WebhookDeliveryEntity,
  WebhookDeliveryStats,
  WebhookPaginatedResult,
  WebhookDeliveryStatus,
  WebhookRetryPolicy,
  WebhookDeliveryFormat,
  WebhookRequestMethod,
} from "@/lib/types";

export interface GetWebhooksFilter {
  search?: string;
  isActive?: boolean;
  eventType?: string;
  userId?: string;
}

export interface GetDeliveriesFilter {
  endpointId?: string;
  eventId?: string;
  status?: WebhookDeliveryStatus;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Webhook Repository
 * Handles all database operations for webhooks, subscriptions, events, and deliveries
 */
export class WebhookRepository {
  // ============================================================================
  // Webhook Endpoint CRUD
  // ============================================================================

  /**
   * Find webhook endpoint by ID
   */
  async findById(id: string): Promise<WebhookEndpointEntity | null> {
    try {
      const [result] = await db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.id, id))
        .limit(1);

      return result as WebhookEndpointEntity || null;
    } catch (error) {
      console.error("WebhookRepository.findById error:", error);
      return null;
    }
  }

  /**
   * Find webhook endpoint by ID with subscriptions
   */
  async findByIdWithSubscriptions(
    id: string
  ): Promise<WebhookEndpointWithSubscriptions | null> {
    try {
      const endpoint = await this.findById(id);
      if (!endpoint) return null;

      const subscriptions = await db
        .select()
        .from(webhookSubscription)
        .where(eq(webhookSubscription.endpointId, id))
        .orderBy(desc(webhookSubscription.createdAt));

      // Get last delivery
      const [lastDeliveryResult] = await db
        .select({
          status: webhookDelivery.status,
          timestamp: webhookDelivery.createdAt,
          responseCode: webhookDelivery.responseCode,
        })
        .from(webhookDelivery)
        .where(eq(webhookDelivery.endpointId, id))
        .orderBy(desc(webhookDelivery.createdAt))
        .limit(1);

      return {
        ...endpoint,
        subscriptions,
        lastDelivery: lastDeliveryResult ? {
          status: lastDeliveryResult.status as WebhookDeliveryStatus,
          timestamp: lastDeliveryResult.timestamp,
          responseCode: lastDeliveryResult.responseCode ?? undefined,
        } : null,
      };
    } catch (error) {
      console.error("WebhookRepository.findByIdWithSubscriptions error:", error);
      return null;
    }
  }

  /**
   * Get paginated list of webhook endpoints with subscriptions
   */
  async findManyWithSubscriptions(
    page: number,
    pageSize: number,
    filter?: GetWebhooksFilter
  ): Promise<WebhookPaginatedResult<WebhookEndpointWithSubscriptions>> {
    try {
      const offset = (page - 1) * pageSize;

      // Build where conditions
      const conditions = [];

      if (filter?.userId) {
        conditions.push(eq(webhookEndpoint.userId, filter.userId));
      }

      if (filter?.search) {
        conditions.push(
          or(
            like(webhookEndpoint.displayName, `%${filter.search}%`),
            like(webhookEndpoint.url, `%${filter.search}%`)
          )
        );
      }

      if (filter?.isActive !== undefined) {
        conditions.push(eq(webhookEndpoint.isActive, filter.isActive));
      }

      let whereCondition =
        conditions.length > 0 ? and(...conditions) : undefined;

      if (filter?.eventType) {
        const endpointIdsWithEvent = await db
          .select({ endpointId: webhookSubscription.endpointId })
          .from(webhookSubscription)
          .where(eq(webhookSubscription.eventType, filter.eventType));

        const ids = endpointIdsWithEvent.map((e) => e.endpointId);
        if (ids.length === 0) {
          return {
            items: [],
            total: 0,
            page,
            pageSize,
            totalPages: 0,
          };
        }

        const eventCondition = inArray(webhookEndpoint.id, ids);
        whereCondition = whereCondition
          ? and(whereCondition, eventCondition)
          : eventCondition;
      }

      const baseQuery = db.select().from(webhookEndpoint);
      const filteredQuery = whereCondition
        ? baseQuery.where(whereCondition)
        : baseQuery;

      const endpoints = await filteredQuery
        .orderBy(desc(webhookEndpoint.createdAt))
        .limit(pageSize)
        .offset(offset);

      // Get total count using final condition
      const countQuery = db.select({ value: count() }).from(webhookEndpoint);
      const countResult = whereCondition
        ? await countQuery.where(whereCondition)
        : await countQuery;

      const total = countResult[0]?.value || 0;

      // Get subscriptions for these endpoints
      const endpointIds = endpoints.map((e) => e.id);
      const subscriptions =
        endpointIds.length > 0
          ? await db
            .select()
            .from(webhookSubscription)
            .where(inArray(webhookSubscription.endpointId, endpointIds))
          : [];

      // Get last deliveries for these endpoints
      const lastDeliveries =
        endpointIds.length > 0
          ? await db
            .select({
              endpointId: webhookDelivery.endpointId,
              status: webhookDelivery.status,
              timestamp: webhookDelivery.createdAt,
              responseCode: webhookDelivery.responseCode,
            })
            .from(webhookDelivery)
            .where(
              and(
                inArray(webhookDelivery.endpointId, endpointIds),
                sql`${webhookDelivery.id} IN (
                    SELECT id FROM ${webhookDelivery}
                    WHERE ${webhookDelivery.endpointId} = ${webhookDelivery.endpointId}
                    ORDER BY ${webhookDelivery.createdAt} DESC
                    LIMIT 1
                  )`
              )
            )
          : [];

      // Combine data
      const items = endpoints.map((endpoint) => {
        const lastDel = lastDeliveries.find((d) => d.endpointId === endpoint.id);
        return {
          ...endpoint as WebhookEndpointEntity,
          subscriptions: subscriptions.filter((s) => s.endpointId === endpoint.id),
          lastDelivery: lastDel ? {
            status: lastDel.status as WebhookDeliveryStatus,
            timestamp: lastDel.timestamp,
            responseCode: lastDel.responseCode ?? undefined,
          } : null,
        };
      });

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      console.error("WebhookRepository.findManyWithSubscriptions error:", error);
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }
  }

  /**
   * Find active webhook endpoints subscribed to a specific event type
   * Used for fanout when an event occurs
   */
  async findActiveEndpointsByEvent(
    userId: string,
    eventType: string
  ): Promise<WebhookEndpointEntity[]> {
    try {
      const endpointIds = await db
        .select({ id: webhookSubscription.endpointId })
        .from(webhookSubscription)
        .where(eq(webhookSubscription.eventType, eventType));

      if (endpointIds.length === 0) {
        return [];
      }

      const endpoints = await db
        .select()
        .from(webhookEndpoint)
        .where(
          and(
            eq(webhookEndpoint.userId, userId),
            eq(webhookEndpoint.isActive, true),
            inArray(
              webhookEndpoint.id,
              endpointIds.map((e) => e.id)
            )
          )
        );

      return endpoints as WebhookEndpointEntity[];
    } catch (error) {
      console.error("WebhookRepository.findActiveEndpointsByEvent error:", error);
      return [];
    }
  }

  /**
   * Create a new webhook endpoint
   */
  async create(data: {
    id: string;
    userId: string;
    displayName: string;
    url: string | null;
    encryptedSecret: string;
    isActive: boolean;
    retryPolicy: WebhookRetryPolicy;
    deliveryFormat: WebhookDeliveryFormat;
    requestMethod: WebhookRequestMethod;
  }): Promise<WebhookEndpointEntity | null> {
    try {
      const now = new Date();
      const [result] = await db
        .insert(webhookEndpoint)
        .values({
          ...data,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return result as WebhookEndpointEntity || null;
    } catch (error) {
      console.error("WebhookRepository.create error:", error);
      return null;
    }
  }

  /**
   * Update a webhook endpoint
   */
  async update(
    id: string,
    data: Partial<Omit<WebhookEndpointEntity, "id" | "userId" | "createdAt">>
  ): Promise<WebhookEndpointEntity | null> {
    try {
      const [result] = await db
        .update(webhookEndpoint)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoint.id, id))
        .returning();

      return result as WebhookEndpointEntity || null;
    } catch (error) {
      console.error("WebhookRepository.update error:", error);
      return null;
    }
  }

  /**
   * Delete a webhook endpoint (cascade deletes subscriptions and deliveries)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(webhookEndpoint)
        .where(eq(webhookEndpoint.id, id));

      return (result.rowsAffected ?? 0) > 0;
    } catch (error) {
      console.error("WebhookRepository.delete error:", error);
      return false;
    }
  }

  // ============================================================================
  // Webhook Subscriptions
  // ============================================================================

  /**
   * Add subscriptions to an endpoint
   */
  async addSubscriptions(
    endpointId: string,
    eventTypes: string[]
  ): Promise<boolean> {
    try {
      if (eventTypes.length === 0) return true;

      const now = new Date();
      const values = eventTypes.map((eventType) => ({
        id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        endpointId,
        eventType,
        createdAt: now,
      }));

      await db.insert(webhookSubscription).values(values);
      return true;
    } catch (error) {
      console.error("WebhookRepository.addSubscriptions error:", error);
      return false;
    }
  }

  /**
   * Remove subscriptions from an endpoint
   */
  async removeSubscriptions(
    endpointId: string,
    eventTypes: string[]
  ): Promise<boolean> {
    try {
      if (eventTypes.length === 0) return true;

      await db
        .delete(webhookSubscription)
        .where(
          and(
            eq(webhookSubscription.endpointId, endpointId),
            inArray(webhookSubscription.eventType, eventTypes)
          )
        );

      return true;
    } catch (error) {
      console.error("WebhookRepository.removeSubscriptions error:", error);
      return false;
    }
  }

  /**
   * Replace all subscriptions for an endpoint
   */
  async replaceSubscriptions(
    endpointId: string,
    eventTypes: string[]
  ): Promise<boolean> {
    try {
      // Delete all existing subscriptions
      await db
        .delete(webhookSubscription)
        .where(eq(webhookSubscription.endpointId, endpointId));

      // Add new subscriptions
      return await this.addSubscriptions(endpointId, eventTypes);
    } catch (error) {
      console.error("WebhookRepository.replaceSubscriptions error:", error);
      return false;
    }
  }

  // ============================================================================
  // Webhook Events
  // ============================================================================

  /**
   * Create a webhook event (audit log)
   */
  async createEvent(data: {
    id: string;
    userId: string;
    type: string;
    payload: Record<string, unknown>;
  }): Promise<WebhookEventEntity | null> {
    try {
      const [result] = await db
        .insert(webhookEvent)
        .values({
          ...data,
          createdAt: new Date(),
        })
        .returning();

      return result as WebhookEventEntity || null;
    } catch (error) {
      console.error("WebhookRepository.createEvent error:", error);
      return null;
    }
  }

  /**
   * Find event by ID
   */
  async findEventById(id: string): Promise<WebhookEventEntity | null> {
    try {
      const [result] = await db
        .select()
        .from(webhookEvent)
        .where(eq(webhookEvent.id, id))
        .limit(1);

      return result as WebhookEventEntity || null;
    } catch (error) {
      console.error("WebhookRepository.findEventById error:", error);
      return null;
    }
  }

  // ============================================================================
  // Webhook Deliveries
  // ============================================================================

  /**
   * Find delivery by ID
   */
  async findDeliveryById(id: string): Promise<WebhookDeliveryEntity | null> {
    try {
      const [result] = await db
        .select()
        .from(webhookDelivery)
        .where(eq(webhookDelivery.id, id))
        .limit(1);

      return (result as WebhookDeliveryEntity) ?? null;
    } catch (error) {
      console.error("WebhookRepository.findDeliveryById error:", error);
      return null;
    }
  }

  /**
   * Find delivery by event and endpoint
   */
  async findDeliveryByEventAndEndpoint(
    eventId: string,
    endpointId: string
  ): Promise<WebhookDeliveryEntity | null> {
    try {
      const [result] = await db
        .select()
        .from(webhookDelivery)
        .where(
          and(
            eq(webhookDelivery.eventId, eventId),
            eq(webhookDelivery.endpointId, endpointId)
          )
        )
        .limit(1);

      return (result as WebhookDeliveryEntity) ?? null;
    } catch (error) {
      console.error(
        "WebhookRepository.findDeliveryByEventAndEndpoint error:",
        error
      );
      return null;
    }
  }

  /**
   * Create a delivery attempt record
   */
  async createDelivery(data: {
    id: string;
    eventId: string;
    endpointId: string;
    status: WebhookDeliveryStatus;
    attemptCount: number;
    responseCode?: number;
    responseBody?: string;
    durationMs?: number;
  }): Promise<WebhookDeliveryEntity | null> {
    try {
      const now = new Date();
      const [result] = await db
        .insert(webhookDelivery)
        .values({
          ...data,
          lastAttemptAt: now,
          createdAt: now,
        })
        .returning();

      return result as WebhookDeliveryEntity || null;
    } catch (error) {
      console.error("WebhookRepository.createDelivery error:", error);
      return null;
    }
  }

  /**
   * Update a delivery attempt
   */
  async updateDelivery(
    id: string,
    data: Partial<Omit<WebhookDeliveryEntity, "id" | "eventId" | "endpointId" | "createdAt">>
  ): Promise<WebhookDeliveryEntity | null> {
    try {
      const updates: Record<string, unknown> = { ...data };
      if (data.status || data.attemptCount !== undefined) {
        updates.lastAttemptAt = new Date();
      }

      const [result] = await db
        .update(webhookDelivery)
        .set(updates)
        .where(eq(webhookDelivery.id, id))
        .returning();

      return result as WebhookDeliveryEntity || null;
    } catch (error) {
      console.error("WebhookRepository.updateDelivery error:", error);
      return null;
    }
  }

  /**
   * Get delivery history for an endpoint
   */
  async getDeliveryHistory(
    endpointId: string,
    page: number,
    pageSize: number
  ): Promise<WebhookPaginatedResult<WebhookDeliveryEntity>> {
    try {
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ value: count() })
        .from(webhookDelivery)
        .where(eq(webhookDelivery.endpointId, endpointId));

      const total = countResult[0]?.value || 0;

      // Get deliveries
      const deliveries = await db
        .select()
        .from(webhookDelivery)
        .where(eq(webhookDelivery.endpointId, endpointId))
        .orderBy(desc(webhookDelivery.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        items: deliveries as WebhookDeliveryEntity[],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      console.error("WebhookRepository.getDeliveryHistory error:", error);
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }
  }

  /**
   * Get delivery statistics (last 7 days)
   */
  async getDeliveryStats(userId: string): Promise<WebhookDeliveryStats> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      // Get user's endpoint IDs
      const userEndpoints = await db
        .select({ id: webhookEndpoint.id })
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.userId, userId));

      const endpointIds = userEndpoints.map((e) => e.id);

      if (endpointIds.length === 0) {
        return {
          successRate: 0,
          trend: 0,
          dailyData: [],
          totalDeliveries: 0,
          successfulDeliveries: 0,
          failedDeliveries: 0,
        };
      }

      // Get last 7 days deliveries
      const recentDeliveries = await db
        .select()
        .from(webhookDelivery)
        .where(
          and(
            inArray(webhookDelivery.endpointId, endpointIds),
            sql`${webhookDelivery.createdAt} >= ${sevenDaysAgo}`
          )
        );

      // Get previous 7 days for trend calculation
      const previousDeliveries = await db
        .select()
        .from(webhookDelivery)
        .where(
          and(
            inArray(webhookDelivery.endpointId, endpointIds),
            sql`${webhookDelivery.createdAt} >= ${fourteenDaysAgo}`,
            sql`${webhookDelivery.createdAt} < ${sevenDaysAgo}`
          )
        );

      // Calculate stats
      const successfulRecent = recentDeliveries.filter((d) => d.status === "success").length;
      const totalRecent = recentDeliveries.length;
      const successRate = totalRecent > 0 ? (successfulRecent / totalRecent) * 100 : 0;

      const successfulPrevious = previousDeliveries.filter((d) => d.status === "success").length;
      const totalPrevious = previousDeliveries.length;
      const previousSuccessRate = totalPrevious > 0 ? (successfulPrevious / totalPrevious) * 100 : 0;
      const trend = successRate - previousSuccessRate;

      // Calculate daily data
      const dailyData = [];
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const dayDeliveries = recentDeliveries.filter((d) => {
          const deliveryDate = new Date(d.createdAt);
          return deliveryDate >= date && deliveryDate < nextDate;
        });

        const daySuccess = dayDeliveries.filter((d) => d.status === "success").length;
        const dayTotal = dayDeliveries.length;
        const daySuccessRate = dayTotal > 0 ? (daySuccess / dayTotal) * 100 : 0;

        dailyData.push({
          day: dayNames[date.getDay()],
          successCount: daySuccess,
          failedCount: dayTotal - daySuccess,
          successRate: daySuccessRate,
        });
      }

      return {
        successRate,
        trend,
        dailyData,
        totalDeliveries: totalRecent,
        successfulDeliveries: successfulRecent,
        failedDeliveries: totalRecent - successfulRecent,
      };
    } catch (error) {
      console.error("WebhookRepository.getDeliveryStats error:", error);
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
}
