import type { AuthorizationModelEntity } from "@/lib/repositories/authorization-model-repository";

export interface RegistrationContextGrantInput {
  entityTypeId: string;
  relation: string;
}

export interface RegistrationContextGrantTarget {
  entityTypeId: string;
  entityType: string;
  modelName: string;
  relation: string;
  ownerClientId: string | null;
  authorizationSpaceId: string | null;
  isProjected: boolean;
}

interface ResolveGrantTargetsArgs {
  sourceClientId: string | null;
  allowedProjectionClientIds: string[];
  allowedAuthorizationSpaceIds?: string[];
  enforceAllowedAuthorizationSpaces?: boolean;
  grants: RegistrationContextGrantInput[];
  resolveModelById: (entityTypeId: string) => Promise<AuthorizationModelEntity | null>;
}

interface ResolveGrantTargetsSuccess {
  ok: true;
  targets: RegistrationContextGrantTarget[];
}

interface ResolveGrantTargetsFailure {
  ok: false;
  error: string;
}

export type ResolveGrantTargetsResult =
  | ResolveGrantTargetsSuccess
  | ResolveGrantTargetsFailure;

export function getAuthorizationModelOwnerClientId(entityType: string): string | null {
  if (!entityType.startsWith("client_")) {
    return null;
  }

  const scopedEntityType = entityType.slice("client_".length);
  const separatorIndex = scopedEntityType.indexOf(":");

  if (separatorIndex === -1) {
    return scopedEntityType || null;
  }

  return scopedEntityType.slice(0, separatorIndex) || null;
}

export function getAuthorizationModelName(entityType: string): string {
  const separatorIndex = entityType.indexOf(":");
  if (separatorIndex === -1) {
    return entityType;
  }

  return entityType.slice(separatorIndex + 1);
}

export function resolveModelOwningClientOrSpace(model: AuthorizationModelEntity): {
  ownerClientId: string | null;
  authorizationSpaceId: string | null;
} {
  return {
    ownerClientId: getAuthorizationModelOwnerClientId(model.entityType),
    authorizationSpaceId: model.authorizationSpaceId,
  };
}

export function resolveTargetAuthorizationSpace(
  model: AuthorizationModelEntity
): string | null {
  return model.authorizationSpaceId;
}

export async function resolveRegistrationContextGrantTargets(
  args: ResolveGrantTargetsArgs
): Promise<ResolveGrantTargetsResult> {
  const allowedProjectionClientIds = new Set(args.allowedProjectionClientIds);
  const allowedAuthorizationSpaceIds = new Set(args.allowedAuthorizationSpaceIds ?? []);
  const targets: RegistrationContextGrantTarget[] = [];

  for (const grant of args.grants) {
    const model = await args.resolveModelById(grant.entityTypeId);
    if (!model) {
      return {
        ok: false,
        error: `Grant target '${grant.entityTypeId}' could not be resolved to an authorization model.`,
      };
    }

    const relationNames = new Set(Object.keys(model.definition.relations ?? {}));
    if (!relationNames.has(grant.relation)) {
      return {
        ok: false,
        error: `Relation '${grant.relation}' is not defined on target model '${model.entityType}'.`,
      };
    }

    const { ownerClientId, authorizationSpaceId } = resolveModelOwningClientOrSpace(model);

    if (authorizationSpaceId) {
      if (
        args.sourceClientId !== null ||
        args.enforceAllowedAuthorizationSpaces === true
      ) {
        if (!allowedAuthorizationSpaceIds.has(authorizationSpaceId)) {
          return {
            ok: false,
            error: args.sourceClientId === null
              ? `Authorization space '${authorizationSpaceId}' is not enabled for registration-context grants.`
              : `Authorization space '${authorizationSpaceId}' is not linked to client '${args.sourceClientId}' with context-trigger access.`,
          };
        }
      }
    } else if (args.sourceClientId !== null) {
      // R2 transition compatibility: models without space ownership keep using
      // the R1 client/projection validation path until backfill is complete.
      if (!ownerClientId) {
        return {
          ok: false,
          error: `Client-scoped registration contexts can only target client-owned models. '${model.entityType}' is not client-owned.`,
        };
      }

      const isSameClient = ownerClientId === args.sourceClientId;
      const isAllowedProjection = allowedProjectionClientIds.has(ownerClientId);

      if (!isSameClient && !isAllowedProjection) {
        return {
          ok: false,
          error: `Target client '${ownerClientId}' is not allowed for client '${args.sourceClientId}'. grantProjectionClientIds is transitional metadata; prefer linking both clients to an authorization space.`,
        };
      }
    }

    targets.push({
      entityTypeId: grant.entityTypeId,
      entityType: model.entityType,
      modelName: getAuthorizationModelName(model.entityType),
      relation: grant.relation,
      ownerClientId,
      authorizationSpaceId,
      isProjected: args.sourceClientId !== null && ownerClientId !== null && ownerClientId !== args.sourceClientId,
    });
  }

  return {
    ok: true,
    targets,
  };
}
