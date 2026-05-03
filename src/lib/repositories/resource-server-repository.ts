import { db } from "@/lib/db";
import { resourceServers } from "@/db/app-schema";
import { eq } from "drizzle-orm";

export interface ResourceServerEntity {
  id: string;
  slug: string;
  name: string;
  audience: string;
  description: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveResourceServerData {
  slug: string;
  name: string;
  audience: string;
  description?: string | null;
  enabled?: boolean;
}

const URL_SAFE_VALUE = /^[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/;
const SLUG_VALUE = /^[a-z0-9][a-z0-9-_.]*$/;

function assertValidResourceServer(data: SaveResourceServerData): void {
  if (!SLUG_VALUE.test(data.slug)) {
    throw new Error("Slug must be lowercase URL-safe text.");
  }

  if (!data.name.trim()) {
    throw new Error("Name is required.");
  }

  if (!URL_SAFE_VALUE.test(data.audience)) {
    throw new Error("Audience must be URL-safe.");
  }
}

export class ResourceServerRepository {
  async findAll(): Promise<ResourceServerEntity[]> {
    const rows = await db.select().from(resourceServers);
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<ResourceServerEntity | null> {
    const [row] = await db
      .select()
      .from(resourceServers)
      .where(eq(resourceServers.id, id));

    return row ?? null;
  }

  async findByAudience(audience: string): Promise<ResourceServerEntity | null> {
    const [row] = await db
      .select()
      .from(resourceServers)
      .where(eq(resourceServers.audience, audience));

    return row ?? null;
  }

  async create(data: SaveResourceServerData): Promise<ResourceServerEntity> {
    assertValidResourceServer(data);

    const id = crypto.randomUUID();
    await db.insert(resourceServers).values({
      id,
      slug: data.slug,
      name: data.name.trim(),
      audience: data.audience.trim(),
      description: data.description?.trim() || null,
      enabled: data.enabled ?? true,
    });

    const created = await this.findById(id);
    if (!created) {
      throw new Error("Failed to create resource server.");
    }

    return created;
  }

  async update(id: string, data: SaveResourceServerData): Promise<ResourceServerEntity | null> {
    assertValidResourceServer(data);

    await db
      .update(resourceServers)
      .set({
        slug: data.slug,
        name: data.name.trim(),
        audience: data.audience.trim(),
        description: data.description?.trim() || null,
        enabled: data.enabled ?? true,
        updatedAt: new Date(),
      })
      .where(eq(resourceServers.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await db.delete(resourceServers).where(eq(resourceServers.id, id));
  }
}
