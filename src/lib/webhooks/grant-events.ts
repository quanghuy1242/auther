import { WebhookRepository } from "@/lib/repositories/webhook-repository";
import { emitWebhookEvent } from "@/lib/webhooks/delivery-service";
import type { WebhookEventType } from "@/lib/constants";

type GrantSubjectType = "user" | "group";

type GrantCreatedEventType = Extract<WebhookEventType, "grant.created">;
type GrantRevokedEventType = Extract<WebhookEventType, "grant.revoked">;
type GrantConditionUpdatedEventType = Extract<WebhookEventType, "grant.condition.updated">;
type GroupMemberAddedEventType = Extract<WebhookEventType, "group.member.added">;
type GroupMemberRemovedEventType = Extract<WebhookEventType, "group.member.removed">;

const webhookRepository = new WebhookRepository();

export interface GrantCreatedEventData {
  tupleId: string;
  subjectType: GrantSubjectType;
  subjectId: string;
  entityType: string;
  entityId: string;
  relation: string;
  hasCondition: boolean;
}

export interface GrantRevokedEventData {
  tupleId: string;
  subjectType: GrantSubjectType;
  subjectId: string;
  entityType: string;
  entityId: string;
  relation: string;
  hasCondition: boolean;
}

export interface GrantConditionUpdatedEventData {
  tupleId: string;
  subjectType: GrantSubjectType;
  subjectId: string;
  entityType: string;
  entityId: string;
  relation: string;
  previousHasCondition: boolean;
  hasCondition: boolean;
}

export interface GroupMembershipEventData {
  groupId: string;
  userId: string;
}

async function emitSystemScopedEvent(
  eventType:
    | GrantCreatedEventType
    | GrantRevokedEventType
    | GrantConditionUpdatedEventType
    | GroupMemberAddedEventType
    | GroupMemberRemovedEventType,
  payload: object
): Promise<void> {
  try {
    const subscriberUserIds = await webhookRepository.findSubscribedUserIdsByEvent(eventType);
    if (subscriberUserIds.length === 0) {
      return;
    }

    await Promise.allSettled(
      subscriberUserIds.map((userId) =>
        emitWebhookEvent(userId, eventType, payload as Record<string, unknown>)
      )
    );
  } catch (error) {
    console.error("Failed to emit system-scoped webhook event:", {
      eventType,
      payload,
      error,
    });
  }
}

export async function emitGrantCreatedEvent(data: GrantCreatedEventData): Promise<void> {
  await emitSystemScopedEvent("grant.created", data);
}

export async function emitGrantRevokedEvent(data: GrantRevokedEventData): Promise<void> {
  await emitSystemScopedEvent("grant.revoked", data);
}

export async function emitGrantConditionUpdatedEvent(
  data: GrantConditionUpdatedEventData
): Promise<void> {
  await emitSystemScopedEvent("grant.condition.updated", data);
}

export async function emitGroupMemberAddedEvent(data: GroupMembershipEventData): Promise<void> {
  await emitSystemScopedEvent("group.member.added", data);
}

export async function emitGroupMemberRemovedEvent(data: GroupMembershipEventData): Promise<void> {
  await emitSystemScopedEvent("group.member.removed", data);
}
