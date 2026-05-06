import { Tuple, TupleRepository } from "@/lib/repositories/tuple-repository";
import { SYSTEM_MODELS } from "@/lib/auth/system-models";

export type PlatformSubjectType = "user" | "group";

export interface PlatformAccessGrant {
  entityType: string;
  entityId?: string;
  relation: string;
  subjectType: PlatformSubjectType;
  subjectId: string;
}

export class PlatformAccessService {
  constructor(private readonly tupleRepo = new TupleRepository()) {}

  listSystemModels() {
    return SYSTEM_MODELS;
  }

  async listGrants(entityType?: string): Promise<Tuple[]> {
    if (entityType) {
      return this.tupleRepo.findByEntityType(entityType);
    }

    const grants = await Promise.all(
      SYSTEM_MODELS.map((model) => this.tupleRepo.findByEntityType(model.entityType))
    );
    return grants.flat();
  }

  async grant(params: PlatformAccessGrant): Promise<Tuple> {
    this.assertSystemRelation(params.entityType, params.relation);

    const result = await this.tupleRepo.createIfNotExists({
      entityType: params.entityType,
      entityTypeId: null,
      entityId: params.entityId ?? "*",
      relation: params.relation,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      subjectRelation: null,
      condition: null,
      authorizationSpaceId: null,
    });

    return result.tuple;
  }

  async replaceSubjectRelation(params: PlatformAccessGrant): Promise<{
    created: boolean;
    removedCount: number;
  }> {
    this.assertSystemRelation(params.entityType, params.relation);

    return this.tupleRepo.replaceSubjectRelationAtomic({
      entityType: params.entityType,
      entityId: params.entityId ?? "*",
      relation: params.relation,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      subjectRelation: null,
      entityTypeId: null,
      condition: null,
    });
  }

  async revoke(params: PlatformAccessGrant): Promise<boolean> {
    this.assertSystemRelation(params.entityType, params.relation);

    return this.tupleRepo.delete({
      entityType: params.entityType,
      entityId: params.entityId ?? "*",
      relation: params.relation,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      condition: null,
      authorizationSpaceId: null,
    });
  }

  async listLegacyOAuthClientAccessTuples(): Promise<Tuple[]> {
    const tuples = await this.tupleRepo.findByEntityType("oauth_client");
    return tuples.filter((tuple) =>
      tuple.relation === "owner" || tuple.relation === "admin" || tuple.relation === "use"
    );
  }

  private assertSystemRelation(entityType: string, relation: string): void {
    const model = SYSTEM_MODELS.find((candidate) => candidate.entityType === entityType);
    if (!model) {
      throw new Error(`Unknown system model: ${entityType}`);
    }

    if (!Object.prototype.hasOwnProperty.call(model.relations, relation)) {
      throw new Error(`Unknown relation '${relation}' for system model '${entityType}'`);
    }
  }
}
