import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getSession } from "@/lib/session";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
  tupleRepository,
} from "@/lib/repositories";

type HeadersValue = Awaited<ReturnType<typeof headers>>;

type ApiKeyRecord = {
  id: string;
  name?: string | null;
  key?: string;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
  expiresAt?: Date | string | null;
};

type CreatedApiKeyRecord = ApiKeyRecord & {
  key: string;
};

export type SpaceServiceAccountGrantInput = {
  modelId: string;
  relation: string;
};

export type SpaceServiceAccountAccessMode = "scoped" | "full_access";

export type SpaceServiceAccountSummary = {
  id: string;
  name: string;
  accessMode: SpaceServiceAccountAccessMode;
  createdAt: Date | null;
  expiresAt: Date | null;
  grants: Array<{
    tupleId: string;
    modelId: string | null;
    entityType: string;
    entityId: string;
    relation: string;
  }>;
};

export type CreateSpaceServiceAccountResult = {
  success: boolean;
  error?: string;
  serviceAccount?: SpaceServiceAccountSummary & {
    key: string;
  };
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function keyBelongsToSpace(key: ApiKeyRecord, authorizationSpaceId: string): boolean {
  return key.metadata?.authorization_space_id === authorizationSpaceId;
}

export class AuthorizationSpaceServiceAccountService {
  constructor(
    private readonly listApiKeysFn = auth.api.listApiKeys,
    private readonly createApiKeyFn = auth.api.createApiKey,
    private readonly deleteApiKeyFn = auth.api.deleteApiKey
  ) {}

  async list(authorizationSpaceId: string): Promise<SpaceServiceAccountSummary[]> {
    await this.assertSpace(authorizationSpaceId);
    const requestHeaders = await headers();
    const allKeys = await this.listApiKeysFn({ headers: requestHeaders });
    if (!Array.isArray(allKeys)) return [];

    const keys = (allKeys as ApiKeyRecord[])
      .filter((key) => keyBelongsToSpace(key, authorizationSpaceId))
      .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));

    return Promise.all(keys.map((key) => this.toSummary(key, authorizationSpaceId)));
  }

  async create(params: {
    authorizationSpaceId: string;
    name: string;
    accessMode: SpaceServiceAccountAccessMode;
    grants: SpaceServiceAccountGrantInput[];
    expiresInDays?: number | null;
  }): Promise<CreateSpaceServiceAccountResult> {
    let space: Awaited<ReturnType<typeof this.assertSpace>>;
    try {
      space = await this.assertSpace(params.authorizationSpaceId);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authorization space not found",
      };
    }

    const session = await getSession();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    let preparedGrants: Array<{ modelId: string; entityType: string; relation: string }>;
    try {
      preparedGrants = await this.prepareGrants(
        params.authorizationSpaceId,
        params.accessMode,
        params.grants
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid service account grants",
      };
    }

    const created = await this.createApiKeyFn({
      body: {
        name: params.name,
        permissions: {},
        expiresIn: params.expiresInDays ? params.expiresInDays * 24 * 60 * 60 : null,
        userId: session.user.id,
        metadata: {
          authorization_space_id: params.authorizationSpaceId,
          access_model: "authorization_space",
        },
      },
    }) as CreatedApiKeyRecord | null;

    if (!created) {
      return { success: false, error: "Failed to create service account" };
    }

    try {
      if (params.accessMode === "full_access") {
        await tupleRepository.createIfNotExists({
          entityType: "authorization_space",
          entityTypeId: null,
          entityId: space.id,
          relation: "full_access",
          subjectType: "apikey",
          subjectId: created.id,
          condition: null,
          authorizationSpaceId: space.id,
        });
      } else {
        for (const grant of preparedGrants) {
          await tupleRepository.createIfNotExists({
            entityType: grant.entityType,
            entityTypeId: grant.modelId,
            entityId: "*",
            relation: grant.relation,
            subjectType: "apikey",
            subjectId: created.id,
            condition: null,
            authorizationSpaceId: space.id,
          });
        }
      }
    } catch (error) {
      await tupleRepository.deleteBySubject("apikey", created.id);
      const requestHeaders = await headers();
      await this.deleteApiKeyFn({ body: { keyId: created.id }, headers: requestHeaders });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to assign service account grants",
      };
    }

    return {
      success: true,
      serviceAccount: {
        ...(await this.toSummary(created, params.authorizationSpaceId)),
        key: created.key,
      },
    };
  }

  async revoke(authorizationSpaceId: string, serviceAccountId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    await this.assertSpace(authorizationSpaceId);
    const requestHeaders = await headers();
    const key = await this.findSpaceKey(requestHeaders, authorizationSpaceId, serviceAccountId);
    if (!key) {
      return { success: false, error: "Service account not found in this authorization space" };
    }

    const result = await this.deleteApiKeyFn({
      body: { keyId: serviceAccountId },
      headers: requestHeaders,
    });
    const deleted =
      result && typeof result === "object" && "success" in result
        ? Boolean((result as { success?: boolean }).success)
        : Boolean(result);

    if (!deleted) {
      return { success: false, error: "Failed to revoke service account key" };
    }

    await tupleRepository.deleteBySubject("apikey", serviceAccountId);
    return { success: true };
  }

  async rotate(authorizationSpaceId: string, serviceAccountId: string): Promise<CreateSpaceServiceAccountResult> {
    await this.assertSpace(authorizationSpaceId);
    const requestHeaders = await headers();
    const key = await this.findSpaceKey(requestHeaders, authorizationSpaceId, serviceAccountId);
    if (!key) {
      return { success: false, error: "Service account not found in this authorization space" };
    }

    const current = await this.toSummary(key, authorizationSpaceId);
    const result = await this.create({
      authorizationSpaceId,
      name: `${current.name} rotated`,
      accessMode: current.accessMode,
      grants: current.grants
        .filter((grant) => grant.modelId)
        .map((grant) => ({
          modelId: grant.modelId as string,
          relation: grant.relation,
        })),
      expiresInDays: null,
    });

    if (!result.success) return result;

    await this.revoke(authorizationSpaceId, serviceAccountId);
    return result;
  }

  private async assertSpace(authorizationSpaceId: string) {
    const space = await authorizationSpaceRepository.findById(authorizationSpaceId);
    if (!space || !space.enabled) {
      throw new Error("Authorization space not found or disabled");
    }
    return space;
  }

  private async prepareGrants(
    authorizationSpaceId: string,
    accessMode: SpaceServiceAccountAccessMode,
    grants: SpaceServiceAccountGrantInput[]
  ) {
    if (accessMode === "full_access") return [];
    if (grants.length === 0) {
      throw new Error("At least one grant is required for scoped service accounts");
    }

    const prepared: Array<{
      modelId: string;
      entityType: string;
      relation: string;
    }> = [];

    for (const grant of grants) {
      const model = await authorizationModelRepository.findById(grant.modelId);
      if (!model || model.authorizationSpaceId !== authorizationSpaceId) {
        throw new Error("Grant model does not belong to this authorization space");
      }
      if (!Object.keys(model.definition.relations ?? {}).includes(grant.relation)) {
        throw new Error(`Relation '${grant.relation}' is not defined for '${model.entityType}'`);
      }
      prepared.push({
        modelId: model.id,
        entityType: model.entityType,
        relation: grant.relation,
      });
    }

    return prepared;
  }

  private async findSpaceKey(
    requestHeaders: HeadersValue,
    authorizationSpaceId: string,
    serviceAccountId: string
  ): Promise<ApiKeyRecord | null> {
    const allKeys = await this.listApiKeysFn({ headers: requestHeaders });
    if (!Array.isArray(allKeys)) return null;
    return (allKeys as ApiKeyRecord[]).find(
      (key) => key.id === serviceAccountId && keyBelongsToSpace(key, authorizationSpaceId)
    ) ?? null;
  }

  private async toSummary(
    key: ApiKeyRecord,
    authorizationSpaceId: string
  ): Promise<SpaceServiceAccountSummary> {
    const tuples = (await tupleRepository.findBySubject("apikey", key.id)).filter(
      (tuple) => tuple.authorizationSpaceId === authorizationSpaceId
    );
    const fullAccess = tuples.some(
      (tuple) =>
        tuple.entityType === "authorization_space" &&
        tuple.entityId === authorizationSpaceId &&
        tuple.relation === "full_access"
    );

    return {
      id: key.id,
      name: key.name ?? key.id,
      accessMode: fullAccess ? "full_access" : "scoped",
      createdAt: toDate(key.createdAt),
      expiresAt: toDate(key.expiresAt),
      grants: tuples.map((tuple) => ({
        tupleId: tuple.id,
        modelId: tuple.entityTypeId ?? null,
        entityType: tuple.entityType,
        entityId: tuple.entityId,
        relation: tuple.relation,
      })),
    };
  }
}
