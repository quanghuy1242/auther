import { db } from "@/lib/db";
import { authorizationSpaces } from "@/db/app-schema";
import { eq, sql } from "drizzle-orm";

type OnboardingTriggerPrincipal = { kind: "oauth_client" | "resource_server"; id: string };

export interface AuthorizationSpaceEntity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  resourceServerId: string | null;
  onboardingEnabled: boolean;
  onboardingAllowedTriggers: OnboardingTriggerPrincipal[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveAuthorizationSpaceData {
  slug: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  resourceServerId?: string | null;
  onboardingEnabled?: boolean;
  onboardingAllowedTriggers?: OnboardingTriggerPrincipal[];
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

const authorizationSpaceSelect = {
  id: authorizationSpaces.id,
  slug: authorizationSpaces.slug,
  name: authorizationSpaces.name,
  description: authorizationSpaces.description,
  enabled: authorizationSpaces.enabled,
  resourceServerId: authorizationSpaces.resourceServerId,
  onboardingEnabled: authorizationSpaces.onboardingEnabled,
  onboardingAllowedTriggersRaw: sql<string>`
    CASE
      WHEN ${authorizationSpaces.onboardingAllowedTriggers} IS NULL THEN '[]'
      WHEN json_valid(${authorizationSpaces.onboardingAllowedTriggers}) = 0 THEN '[]'
      WHEN json_type(${authorizationSpaces.onboardingAllowedTriggers}) != 'array' THEN '[]'
      ELSE ${authorizationSpaces.onboardingAllowedTriggers}
    END
  `,
  createdAt: authorizationSpaces.createdAt,
  updatedAt: authorizationSpaces.updatedAt,
};

type AuthorizationSpaceSelectedRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  resourceServerId: string | null;
  onboardingEnabled: boolean;
  onboardingAllowedTriggersRaw: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function isOnboardingTriggerPrincipal(value: unknown): value is OnboardingTriggerPrincipal {
  if (!value || typeof value !== "object") {
    return false;
  }

  const trigger = value as Record<string, unknown>;
  return (
    (trigger.kind === "oauth_client" || trigger.kind === "resource_server") &&
    typeof trigger.id === "string" &&
    trigger.id.trim().length > 0
  );
}

function parseOnboardingAllowedTriggers(value: unknown): OnboardingTriggerPrincipal[] {
  const parsed = (() => {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value !== "string" || !value.trim()) {
      return [];
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  })();

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(isOnboardingTriggerPrincipal)
    .map((trigger) => ({ kind: trigger.kind, id: trigger.id.trim() }));
}

function mapAuthorizationSpace(row: AuthorizationSpaceSelectedRow): AuthorizationSpaceEntity {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    resourceServerId: row.resourceServerId,
    onboardingEnabled: row.onboardingEnabled,
    onboardingAllowedTriggers: parseOnboardingAllowedTriggers(row.onboardingAllowedTriggersRaw),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class AuthorizationSpaceRepository {
  async findAll(): Promise<AuthorizationSpaceEntity[]> {
    const rows = await db.select(authorizationSpaceSelect).from(authorizationSpaces);
    return rows.map(mapAuthorizationSpace).sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<AuthorizationSpaceEntity | null> {
    const [row] = await db
      .select(authorizationSpaceSelect)
      .from(authorizationSpaces)
      .where(eq(authorizationSpaces.id, id));

    return row ? mapAuthorizationSpace(row) : null;
  }

  async findBySlug(slug: string): Promise<AuthorizationSpaceEntity | null> {
    const [row] = await db
      .select(authorizationSpaceSelect)
      .from(authorizationSpaces)
      .where(eq(authorizationSpaces.slug, slug));

    return row ? mapAuthorizationSpace(row) : null;
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
      onboardingEnabled: data.onboardingEnabled ?? false,
      onboardingAllowedTriggers: data.onboardingAllowedTriggers ?? [],
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
    const existing = await this.findById(id);

    await db
      .update(authorizationSpaces)
      .set({
        slug: data.slug,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        enabled: data.enabled ?? true,
        resourceServerId: data.resourceServerId || null,
        onboardingEnabled: data.onboardingEnabled ?? existing?.onboardingEnabled ?? false,
        onboardingAllowedTriggers:
          data.onboardingAllowedTriggers ?? existing?.onboardingAllowedTriggers ?? [],
        updatedAt: new Date(),
      })
      .where(eq(authorizationSpaces.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await db.delete(authorizationSpaces).where(eq(authorizationSpaces.id, id));
  }

  async updateOnboardingPolicy(
    id: string,
    data: {
      onboardingEnabled: boolean;
      onboardingAllowedTriggers: Array<{ kind: "oauth_client" | "resource_server"; id: string }>;
    }
  ): Promise<AuthorizationSpaceEntity | null> {
    await db
      .update(authorizationSpaces)
      .set({
        onboardingEnabled: data.onboardingEnabled,
        onboardingAllowedTriggers: data.onboardingAllowedTriggers,
        updatedAt: new Date(),
      })
      .where(eq(authorizationSpaces.id, id));

    return this.findById(id);
  }
}
