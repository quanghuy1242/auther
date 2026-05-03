import { db } from "@/lib/db";
import { oauthClientSpaceLinks } from "@/db/app-schema";
import { and, eq } from "drizzle-orm";

export type ClientSpaceAccessMode = "login_only" | "can_trigger_contexts" | "full";

export interface OAuthClientSpaceLinkEntity {
  id: string;
  clientId: string;
  authorizationSpaceId: string;
  accessMode: ClientSpaceAccessMode;
  createdAt: Date;
  updatedAt: Date;
}

export class OAuthClientSpaceLinkRepository {
  async listByClientId(clientId: string): Promise<OAuthClientSpaceLinkEntity[]> {
    const rows = await db
      .select()
      .from(oauthClientSpaceLinks)
      .where(eq(oauthClientSpaceLinks.clientId, clientId));

    return rows as OAuthClientSpaceLinkEntity[];
  }

  async listByAuthorizationSpaceId(
    authorizationSpaceId: string
  ): Promise<OAuthClientSpaceLinkEntity[]> {
    const rows = await db
      .select()
      .from(oauthClientSpaceLinks)
      .where(eq(oauthClientSpaceLinks.authorizationSpaceId, authorizationSpaceId));

    return rows as OAuthClientSpaceLinkEntity[];
  }

  async create(data: {
    clientId: string;
    authorizationSpaceId: string;
    accessMode: ClientSpaceAccessMode;
  }): Promise<OAuthClientSpaceLinkEntity> {
    const existing = await this.findByClientAndSpace(
      data.clientId,
      data.authorizationSpaceId
    );

    if (existing) {
      await db
        .update(oauthClientSpaceLinks)
        .set({
          accessMode: data.accessMode,
          updatedAt: new Date(),
        })
        .where(eq(oauthClientSpaceLinks.id, existing.id));

      const updated = await this.findByClientAndSpace(
        data.clientId,
        data.authorizationSpaceId
      );
      if (!updated) {
        throw new Error("Failed to update client-space link.");
      }
      return updated;
    }

    const id = crypto.randomUUID();
    await db.insert(oauthClientSpaceLinks).values({
      id,
      clientId: data.clientId,
      authorizationSpaceId: data.authorizationSpaceId,
      accessMode: data.accessMode,
    });

    const created = await this.findByClientAndSpace(
      data.clientId,
      data.authorizationSpaceId
    );
    if (!created) {
      throw new Error("Failed to create client-space link.");
    }
    return created;
  }

  async delete(id: string): Promise<void> {
    await db.delete(oauthClientSpaceLinks).where(eq(oauthClientSpaceLinks.id, id));
  }

  async findByClientAndSpace(
    clientId: string,
    authorizationSpaceId: string
  ): Promise<OAuthClientSpaceLinkEntity | null> {
    const [row] = await db
      .select()
      .from(oauthClientSpaceLinks)
      .where(
        and(
          eq(oauthClientSpaceLinks.clientId, clientId),
          eq(oauthClientSpaceLinks.authorizationSpaceId, authorizationSpaceId)
        )
      );

    return (row as OAuthClientSpaceLinkEntity | undefined) ?? null;
  }
}
