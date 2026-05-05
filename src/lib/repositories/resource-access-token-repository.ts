import { and, eq, inArray } from "drizzle-orm";

import { authorizationSpaces, oauthAccessToken, oauthClientSpaceLinks, resourceServers, user } from "@/db/schema";
import { db } from "@/lib/db";
import type { ClientSpaceAccessMode } from "./oauth-client-space-link-repository";

export type ResourceTokenSource = {
  accessTokenExpiresAt: Date | null;
  clientId: string;
  scope: string | null;
  userEmail: string;
  userId: string;
  userName: string;
  userRole: string | null;
  resourceServerAudience: string;
  resourceServerId: string;
  authorizationSpaceId: string;
};

export type FindResourceTokenSourceParams = {
  opaqueAccessToken: string;
  authorizationSpaceSlug: string;
  resourceServerSlug: string;
  accessModes: ClientSpaceAccessMode[];
};

export class ResourceAccessTokenRepository {
  async findSourceByOpaqueAccessToken(
    params: FindResourceTokenSourceParams
  ): Promise<ResourceTokenSource | null> {
    const [row] = await db
      .select({
        accessTokenExpiresAt: oauthAccessToken.accessTokenExpiresAt,
        clientId: oauthAccessToken.clientId,
        scope: oauthAccessToken.scopes,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
        resourceServerAudience: resourceServers.audience,
        resourceServerId: resourceServers.id,
        authorizationSpaceId: authorizationSpaces.id,
      })
      .from(oauthAccessToken)
      .innerJoin(user, eq(oauthAccessToken.userId, user.id))
      .innerJoin(oauthClientSpaceLinks, eq(oauthAccessToken.clientId, oauthClientSpaceLinks.clientId))
      .innerJoin(authorizationSpaces, eq(oauthClientSpaceLinks.authorizationSpaceId, authorizationSpaces.id))
      .innerJoin(resourceServers, eq(authorizationSpaces.resourceServerId, resourceServers.id))
      .where(
        and(
          eq(oauthAccessToken.accessToken, params.opaqueAccessToken),
          eq(authorizationSpaces.slug, params.authorizationSpaceSlug),
          eq(authorizationSpaces.enabled, true),
          eq(resourceServers.slug, params.resourceServerSlug),
          eq(resourceServers.enabled, true),
          inArray(oauthClientSpaceLinks.accessMode, params.accessModes),
        ),
      );

    return (row as ResourceTokenSource | undefined) ?? null;
  }
}
