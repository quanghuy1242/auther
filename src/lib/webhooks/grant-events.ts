import { WebhookRepository } from "@/lib/repositories/webhook-repository";
import { emitWebhookEvent } from "@/lib/webhooks/delivery-service";
import type { WebhookEventType } from "@/lib/constants";

type GrantSubjectType = "user" | "group" | "apikey";

type GrantCreatedEventType = Extract<WebhookEventType, "grant.created">;
type GrantRevokedEventType = Extract<WebhookEventType, "grant.revoked">;
type GrantConditionUpdatedEventType = Extract<WebhookEventType, "grant.condition.updated">;
type GroupMemberAddedEventType = Extract<WebhookEventType, "group.member.added">;
type GroupMemberRemovedEventType = Extract<WebhookEventType, "group.member.removed">;

const webhookRepository = new WebhookRepository();

/**
 * Resolves the client ID for a grant event, if the grant belongs to a client.
 * Supports:
 * - Namespaced client resources: `client_xyz:book` -> `xyz`
 * - Exact client-wide grants: `client_xyz` with `entityId = xyz`
 * - Client-wide full-access grants: `oauth_client` with `relation = full_access`
 */
export function resolveGrantClientId(data: {
  entityType: string;
  entityId: string;
  relation: string;
}): string | null {
  const { entityType, entityId, relation } = data;

  if (entityType === "oauth_client" && relation === "full_access") {
    return entityId || null;
  }

  const clientPrefix = "client_";
  if (!entityType.startsWith(clientPrefix)) {
    return null;
  }

  const clientScope = entityType.slice(clientPrefix.length);
  const colonIndex = clientScope.indexOf(":");

  if (colonIndex >= 0) {
    return clientScope.slice(0, colonIndex) || null;
  }

  // Exact client-wide grant scope uses entityType="client_<clientId>" and entityId=<clientId>.
  if (clientScope !== entityId) {
    return null;
  }

  return clientScope || null;
}

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
  payload: object,
  clientId?: string | null
): Promise<void> {
  try {
    const subscriberUserIds = await webhookRepository.findSubscribedUserIdsByEvent(eventType, clientId);
    if (subscriberUserIds.length === 0) {
      return;
    }

    // Include clientId in the delivered payload so consumers can self-verify.
    const payloadWithClient = clientId
      ? { ...(payload as Record<string, unknown>), clientId }
      : payload as Record<string, unknown>;

    await Promise.allSettled(
      subscriberUserIds.map((userId) =>
        emitWebhookEvent(userId, eventType, payloadWithClient)
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
  const clientId = resolveGrantClientId(data);
  await emitSystemScopedEvent("grant.created", data, clientId);
}

export async function emitGrantRevokedEvent(data: GrantRevokedEventData): Promise<void> {
  const clientId = resolveGrantClientId(data);
  await emitSystemScopedEvent("grant.revoked", data, clientId);
}

export async function emitGrantConditionUpdatedEvent(
  data: GrantConditionUpdatedEventData
): Promise<void> {
  const clientId = resolveGrantClientId(data);
  await emitSystemScopedEvent("grant.condition.updated", data, clientId);
}

export async function emitGroupMemberAddedEvent(data: GroupMembershipEventData): Promise<void> {
  await emitSystemScopedEvent("group.member.added", data);
}

export async function emitGroupMemberRemovedEvent(data: GroupMembershipEventData): Promise<void> {
  await emitSystemScopedEvent("group.member.removed", data);
}
