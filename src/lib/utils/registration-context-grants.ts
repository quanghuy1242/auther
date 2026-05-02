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
  isProjected: boolean;
}

interface ResolveGrantTargetsArgs {
  sourceClientId: string | null;
  allowedProjectionClientIds: string[];
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

export async function resolveRegistrationContextGrantTargets(
  args: ResolveGrantTargetsArgs
): Promise<ResolveGrantTargetsResult> {
  const allowedProjectionClientIds = new Set(args.allowedProjectionClientIds);
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

    const ownerClientId = getAuthorizationModelOwnerClientId(model.entityType);

    if (args.sourceClientId !== null) {
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
          error: `Target client '${ownerClientId}' is not allowed for client '${args.sourceClientId}'. Add it to grantProjectionClientIds before using '${model.entityType}'.`,
        };
      }
    }

    targets.push({
      entityTypeId: grant.entityTypeId,
      entityType: model.entityType,
      modelName: getAuthorizationModelName(model.entityType),
      relation: grant.relation,
      ownerClientId,
      isProjected: args.sourceClientId !== null && ownerClientId !== null && ownerClientId !== args.sourceClientId,
    });
  }

  return {
    ok: true,
    targets,
  };
}
