import { db } from "@/lib/db";
import { authorizationSpaces } from "@/db/app-schema";
import { eq } from "drizzle-orm";

export interface AuthorizationSpaceEntity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  resourceServerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveAuthorizationSpaceData {
  slug: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  resourceServerId?: string | null;
}

const SLUG_VALUE = /^[a-z0-9][a-z0-9-_.]*$/;

function assertValidAuthorizationSpace(data: SaveAuthorizationSpaceData): void {
  if (!SLUG_VALUE.test(data.slug)) {
    throw new Error("Slug must be lowercase URL-safe text.");
  }

  if (!data.name.trim()) {
    throw new Error("Name is required.");
  }
}

export class AuthorizationSpaceRepository {
  async findAll(): Promise<AuthorizationSpaceEntity[]> {
    const rows = await db.select().from(authorizationSpaces);
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<AuthorizationSpaceEntity | null> {
    const [row] = await db
      .select()
      .from(authorizationSpaces)
      .where(eq(authorizationSpaces.id, id));

    return row ?? null;
  }

  async findBySlug(slug: string): Promise<AuthorizationSpaceEntity | null> {
    const [row] = await db
      .select()
      .from(authorizationSpaces)
      .where(eq(authorizationSpaces.slug, slug));

    return row ?? null;
  }

  async create(data: SaveAuthorizationSpaceData): Promise<AuthorizationSpaceEntity> {
    assertValidAuthorizationSpace(data);

    const id = crypto.randomUUID();
    await db.insert(authorizationSpaces).values({
      id,
      slug: data.slug,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      enabled: data.enabled ?? true,
      resourceServerId: data.resourceServerId || null,
    });

    const created = await this.findById(id);
    if (!created) {
      throw new Error("Failed to create authorization space.");
    }

    return created;
  }

  async update(
    id: string,
    data: SaveAuthorizationSpaceData
  ): Promise<AuthorizationSpaceEntity | null> {
    assertValidAuthorizationSpace(data);

    await db
      .update(authorizationSpaces)
      .set({
        slug: data.slug,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        enabled: data.enabled ?? true,
        resourceServerId: data.resourceServerId || null,
        updatedAt: new Date(),
      })
      .where(eq(authorizationSpaces.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await db.delete(authorizationSpaces).where(eq(authorizationSpaces.id, id));
  }
}
