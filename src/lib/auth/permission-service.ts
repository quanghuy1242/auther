import { TupleRepository } from "@/lib/repositories/tuple-repository";
import { AuthorizationModelService } from "@/lib/auth/authorization-model-service";
import { UserGroupRepository } from "@/lib/repositories/user-group-repository";
import { LuaPolicyEngine } from "@/lib/auth/policy-engine";

export class PermissionService {
  private tupleRepo: TupleRepository;
  private modelService: AuthorizationModelService;
  private groupRepo: UserGroupRepository;
  private policyEngine: LuaPolicyEngine;

  constructor() {
    this.tupleRepo = new TupleRepository();
    this.modelService = new AuthorizationModelService();
    this.groupRepo = new UserGroupRepository();
    this.policyEngine = new LuaPolicyEngine();
  }

  /**
   * Check if a subject has a specific permission on an entity.
   * 
   * @param subjectType 'user' | 'apikey' | 'group'
   * @param subjectId The ID of the actor
   * @param entityType The type of resource (e.g. 'invoice')
   * @param entityId The ID of the resource
   * @param permission The action being performed (e.g. 'read')
   * @param context Optional context for ABAC checks (e.g. { resource: { amount: 500 } })
   */
  async checkPermission(
    subjectType: string,
    subjectId: string,
    entityType: string,
    entityId: string,
    permission: string,
    context: Record<string, unknown> = {}
  ): Promise<boolean> {
    try {
      // 1. Get Authorization Model
      const model = await this.modelService.getModel(entityType);
      if (!model) {
        console.debug(`No authorization model found for entity type '${entityType}'. Denying access.`);
        return false;
      }

      // 2. Get Required Relation
      const permDef = model.permissions[permission];
      if (!permDef) {
        console.warn(`Permission '${permission}' not defined in model for '${entityType}'. Denying access.`);
        return false;
      }
      const requiredRelation = permDef.relation;

      // 3. Expand Subject (Handle Groups & Recursion)
      const subjects = await this.expandSubjects(subjectType, subjectId);

      // 4. Expand Relations (Transitivity)
      const validRelations = this.getImpliedRelations(model.relations, requiredRelation);

      // 5. Check Tuples (Graph Traversal)
      for (const subject of subjects) {
        for (const relation of validRelations) {
          // A. Direct Match
          const direct = await this.tupleRepo.findExact({
            entityType,
            entityId,
            relation,
            subjectType: subject.type,
            subjectId: subject.id,
          });

          if (direct) {
            return await this.checkPolicy(permDef.policy, permDef.policyEngine, context);
          }

          // B. Wildcard Match
          const wildcard = await this.tupleRepo.findExact({
            entityType,
            entityId: "*",
            relation,
            subjectType: subject.type,
            subjectId: subject.id,
          });

          if (wildcard) {
            return await this.checkPolicy(permDef.policy, permDef.policyEngine, context);
          }
        }
      }

      return false;
    } catch (error) {
      console.error("PermissionService.checkPermission error:", error);
      return false;
    }
  }

  /**
   * Recursively finds all subjects that the given subject "belongs to".
   * e.g. User -> UserGroups -> ParentGroups
   */
  private async expandSubjects(type: string, id: string): Promise<Array<{ type: string, id: string }>> {
    const subjects = new Map<string, { type: string, id: string }>();
    const queue = [{ type, id }];
    const key = (t: string, i: string) => `${t}:${i}`;
    
    subjects.set(key(type, id), { type, id });

    // 1. Add legacy user groups
    if (type === "user") {
      const legacyGroups = await this.groupRepo.getUserGroups(id);
      for (const g of legacyGroups) {
        const k = key("group", g.id);
        if (!subjects.has(k)) {
          subjects.set(k, { type: "group", id: g.id });
          queue.push({ type: "group", id: g.id });
        }
      }
    }

    // 2. BFS for nested groups via access_tuples (relation='member')
    while (queue.length > 0) {
      const current = queue.shift()!;
      
      // Query for any group that lists 'current' as a 'member'
      const memberships = await this.tupleRepo.findBySubject(current.type, current.id);
      
      for (const tuple of memberships) {
        // We assume that if a tuple exists on a 'group' entity with relation 'member',
        // it implies membership inheritance.
        if (tuple.entityType === "group" && tuple.relation === "member") {
          const k = key("group", tuple.entityId);
          if (!subjects.has(k)) {
            subjects.set(k, { type: "group", id: tuple.entityId });
            queue.push({ type: "group", id: tuple.entityId });
          }
        }
      }
    }

    return Array.from(subjects.values());
  }

  private getImpliedRelations(
    relationMap: Record<string, string[]>,
    target: string
  ): string[] {
    const result = new Set<string>();
    const queue = [target];
    result.add(target);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const impliers = relationMap[current] || [];
      for (const implier of impliers) {
        if (!result.has(implier)) {
          result.add(implier);
          queue.push(implier);
        }
      }
    }
    return Array.from(result);
  }

  private async checkPolicy(policy: string | undefined, engineType: "lua" | undefined, context: Record<string, unknown>): Promise<boolean> {
    if (!policy) return true;
    
    if (engineType === "lua") {
      return this.policyEngine.execute(policy, context);
    }

    return true;
  }
}