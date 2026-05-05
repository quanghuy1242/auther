import {
  authorizationModelRepository,
  oauthClientSpaceLinkRepository,
  type OAuthClientSpaceLinkEntity,
} from "@/lib/repositories";

const CLIENT_ENTITY_TYPE_RE = /^client_([^:]+):/;

export interface AuthorizationSpaceAccessClientResolution {
  clientId: string;
  link: OAuthClientSpaceLinkEntity;
  reason: "model_owner" | "full_link" | "first_link";
  modelCount: number;
  linkedClientCount: number;
}

function extractModelOwnerClientId(entityType: string): string | null {
  return entityType.match(CLIENT_ENTITY_TYPE_RE)?.[1] ?? null;
}

export async function resolveAuthorizationSpaceAccessClient(
  authorizationSpaceId: string
): Promise<AuthorizationSpaceAccessClientResolution | null> {
  const [links, models] = await Promise.all([
    oauthClientSpaceLinkRepository.listByAuthorizationSpaceId(authorizationSpaceId),
    authorizationModelRepository.findAll(),
  ]);

  if (links.length === 0) {
    return null;
  }

  const linkedClientIds = new Set(links.map((link) => link.clientId));
  const modelCountsByClientId = new Map<string, number>();

  for (const model of models) {
    if (model.authorizationSpaceId !== authorizationSpaceId) {
      continue;
    }

    const ownerClientId = extractModelOwnerClientId(model.entityType);
    if (!ownerClientId || !linkedClientIds.has(ownerClientId)) {
      continue;
    }

    modelCountsByClientId.set(
      ownerClientId,
      (modelCountsByClientId.get(ownerClientId) ?? 0) + 1
    );
  }

  const modelOwnerLinks = links
    .map((link) => ({
      link,
      modelCount: modelCountsByClientId.get(link.clientId) ?? 0,
    }))
    .filter((candidate) => candidate.modelCount > 0)
    .sort((a, b) => {
      if (b.modelCount !== a.modelCount) {
        return b.modelCount - a.modelCount;
      }

      if (a.link.accessMode !== b.link.accessMode) {
        return a.link.accessMode === "full" ? -1 : 1;
      }

      return a.link.clientId.localeCompare(b.link.clientId);
    });

  const modelOwner = modelOwnerLinks[0];
  if (modelOwner) {
    return {
      clientId: modelOwner.link.clientId,
      link: modelOwner.link,
      reason: "model_owner",
      modelCount: modelOwner.modelCount,
      linkedClientCount: links.length,
    };
  }

  const fullLink = links.find((link) => link.accessMode === "full");
  if (fullLink) {
    return {
      clientId: fullLink.clientId,
      link: fullLink,
      reason: "full_link",
      modelCount: 0,
      linkedClientCount: links.length,
    };
  }

  return {
    clientId: links[0].clientId,
    link: links[0],
    reason: "first_link",
    modelCount: 0,
    linkedClientCount: links.length,
  };
}
