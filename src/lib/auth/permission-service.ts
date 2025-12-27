import { TupleRepository } from "@/lib/repositories/tuple-repository";
import { AuthorizationModelService } from "@/lib/auth/authorization-model-service";
import { UserGroupRepository } from "@/lib/repositories/user-group-repository";
import { UserRepository } from "@/lib/repositories/user-repository";
import { LuaPolicyEngine } from "@/lib/auth/policy-engine";
import { abacRepository } from "@/lib/repositories/abac-repository";
import { metricsService } from "@/lib/services";

export class PermissionService {
  private tupleRepo: TupleRepository;
  private modelService: AuthorizationModelService;
  private groupRepo: UserGroupRepository;
  private userRepo: UserRepository;
  private policyEngine: LuaPolicyEngine;

  constructor() {
    this.tupleRepo = new TupleRepository();
    this.modelService = new AuthorizationModelService();
    this.groupRepo = new UserGroupRepository();
    this.userRepo = new UserRepository();
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
    const checkStart = performance.now();
    try {
      // 0. Global Admin Bypass
      if (subjectType === "user") {
        const user = await this.userRepo.findById(subjectId);
        if (user && user.role === "admin") {
          const duration = performance.now() - checkStart;
          void metricsService.histogram("authz.check.duration_ms", duration, { result: "admin_bypass", entity_type: entityType });
          void metricsService.count("authz.decision.count", 1, { result: "allowed", source: "admin_bypass" });
          return true;
        }
      }

      // 1. Get Authorization Model
      const model = await this.modelService.getModel(entityType);
      if (!model) {
        console.debug(`No authorization model found for entity type '${entityType}'. Denying access.`);
        const duration = performance.now() - checkStart;
        void metricsService.histogram("authz.check.duration_ms", duration, { result: "denied", reason: "no_model", entity_type: entityType });
        void metricsService.count("authz.decision.count", 1, { result: "denied", source: "no_model" });
        return false;
      }

      // 2. Get Required Relation
      const permDef = model.permissions[permission];
      if (!permDef) {
        console.warn(`Permission '${permission}' not defined in model for '${entityType}'. Denying access.`);
        const duration = performance.now() - checkStart;
        void metricsService.histogram("authz.check.duration_ms", duration, { result: "denied", reason: "no_permission", entity_type: entityType });
        void metricsService.count("authz.decision.count", 1, { result: "denied", source: "no_permission" });
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
            // Priority: tuple-level condition > permission-level policy
            const allowed = await this.evaluatePolicy(direct.condition, permDef, context, {
              entityType,
              entityId,
              permission,
              subjectType,
              subjectId,
            });
            const duration = performance.now() - checkStart;
            const result = allowed ? "allowed" : "denied";
            void metricsService.histogram("authz.check.duration_ms", duration, { result, entity_type: entityType });
            void metricsService.count("authz.decision.count", 1, { result, source: "tuple" });
            return allowed;
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
            // Priority: tuple-level condition > permission-level policy
            const allowed = await this.evaluatePolicy(wildcard.condition, permDef, context, {
              entityType,
              entityId,
              permission,
              subjectType,
              subjectId,
            });
            const duration = performance.now() - checkStart;
            const result = allowed ? "allowed" : "denied";
            void metricsService.histogram("authz.check.duration_ms", duration, { result, entity_type: entityType });
            void metricsService.count("authz.decision.count", 1, { result, source: "wildcard_tuple" });
            return allowed;
          }
        }
      }

      const duration = performance.now() - checkStart;
      void metricsService.histogram("authz.check.duration_ms", duration, { result: "denied", reason: "no_tuple", entity_type: entityType });
      void metricsService.count("authz.decision.count", 1, { result: "denied", source: "no_tuple" });
      return false;
    } catch (error) {
      console.error("PermissionService.checkPermission error:", error);
      const duration = performance.now() - checkStart;
      void metricsService.histogram("authz.check.duration_ms", duration, { result: "error", entity_type: entityType });
      void metricsService.count("authz.error.count", 1, { stage: "check_permission" });
      return false;
    }
  }

  /**
  * Recursively finds all subjects that the given subject "belongs to".
  * e.g. User -> UserGroups -> ParentGroups
  * 
  * NOW SUPPORTS DYNAMIC HIERARCHIES:
  * Any relation marked with `subjectParams: { hierarchy: true }` in the
  * authorization model will be traversed.
  */
  private async expandSubjects(type: string, id: string): Promise<Array<{ type: string, id: string }>> {
    const subjects = new Map<string, { type: string, id: string }>();
    const queue = [{ type, id }];
    const key = (t: string, i: string) => `${t}:${i}`;
    let traversalDepth = 0;

    subjects.set(key(type, id), { type, id });

    // 1. Add legacy user groups (for backward compatibility)
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

    // 2. BFS for nested membership
    while (queue.length > 0) {
      const current = queue.shift()!;

      // Find all tuples where 'current' is the subject
      const memberships = await this.tupleRepo.findBySubject(current.type, current.id);

      for (const tuple of memberships) {
        // Load model for the container entity (e.g., the group, team, or org)
        const model = await this.modelService.getModel(tuple.entityType);

        if (!model) continue;

        // Check if the relation is hierarchical
        const relDef = model.relations[tuple.relation];
        let isHierarchy = false;

        if (relDef && !Array.isArray(relDef) && typeof relDef === "object") {
          if (relDef.subjectParams?.hierarchy) {
            isHierarchy = true;
          }
        } else {
          // Legacy fallback: hardcoded 'group:member' check for backward compatibility
          // if the model hasn't been migrated to use the hierarchy flag yet.
          if (tuple.entityType === "group" && tuple.relation === "member") {
            isHierarchy = true;
          }
        }

        if (isHierarchy) {
          const k = key(tuple.entityType, tuple.entityId);
          if (!subjects.has(k)) {
            subjects.set(k, { type: tuple.entityType, id: tuple.entityId });
            queue.push({ type: tuple.entityType, id: tuple.entityId });
          }
        }
      }
      traversalDepth++;
    }

    // Metric: ReBAC traversal depth and fan-out
    void metricsService.histogram("authz.rebac.traversal_depth", traversalDepth, { entity_type: type });
    void metricsService.histogram("authz.rebac.subjects_expanded", subjects.size, { entity_type: type });

    return Array.from(subjects.values());
  }

  /**
   * Resolve all permissions for a user (including group inheritance).
   * Returns a map of entityId -> granted permissions.
   */
  async resolveAllPermissions(userId: string): Promise<Record<string, string[]>> {
    try {
      const permissions: Record<string, string[]> = {};

      // 1. Expand subjects (User + Groups)
      const subjects = await this.expandSubjects("user", userId);

      // 2. Find all tuples for these subjects
      const tuples = await this.tupleRepo.findBySubjects(subjects);

      if (tuples.length === 0) {
        return permissions;
      }

      // 3. Group tuples by entity type
      const tuplesByEntityType = new Map<string, typeof tuples>();
      for (const tuple of tuples) {
        // Skip group membership tuples
        if (tuple.entityType === "group" && tuple.relation === "member") continue;

        const existing = tuplesByEntityType.get(tuple.entityType) || [];
        existing.push(tuple);
        tuplesByEntityType.set(tuple.entityType, existing);
      }

      // 4. Resolve permissions for each entity type
      for (const [entityType, entityTuples] of tuplesByEntityType) {
        const model = await this.modelService.getModel(entityType);

        for (const tuple of entityTuples) {
          const entityKey = tuple.entityId === "*"
            ? entityType
            : `${entityType}:${tuple.entityId}`;

          if (!permissions[entityKey]) {
            permissions[entityKey] = [];
          }

          if (model?.permissions) {
            // Find all permissions that this relation grants
            for (const [permName, permDef] of Object.entries(model.permissions)) {
              if (this.relationGrantsPermission(tuple.relation, permDef.relation, model.relations)) {
                if (!permissions[entityKey].includes(permName)) {
                  permissions[entityKey].push(permName);
                }
              }
            }
          }

          // Always include the raw relation
          if (!permissions[entityKey].includes(tuple.relation)) {
            permissions[entityKey].push(tuple.relation);
          }
        }
      }

      return permissions;
    } catch (error) {
      console.error("PermissionService.resolveAllPermissions error:", error);
      return {};
    }
  }

  /**
   * Resolve all permissions for a user WITH ABAC metadata.
   * Returns permissions AND which ones require runtime ABAC evaluation.
   * 
   * USE THIS FOR JWT GENERATION so consuming services know when to
   * call POST /api/auth/check-permission vs using JWT permissions directly.
   * 
   * A permission requires ABAC evaluation if:
   * 1. The permission has a policy in the authorization model (permission-level ABAC)
   * 2. The tuple granting it has a condition attached (tuple-level ABAC)
   * 
   * @param userId - The user ID to resolve permissions for
   * @returns {permissions, abac_required} for JWT payload
   */
  async resolveAllPermissionsWithABACInfo(userId: string): Promise<{
    permissions: Record<string, string[]>;
    abac_required: Record<string, string[]>;
  }> {
    try {
      const permissions: Record<string, string[]> = {};
      const abac_required: Record<string, string[]> = {};

      // 1. Expand subjects (User + Groups)
      const subjects = await this.expandSubjects("user", userId);

      // 2. Find all tuples for these subjects
      const tuples = await this.tupleRepo.findBySubjects(subjects);

      if (tuples.length === 0) {
        return { permissions, abac_required };
      }

      // 3. Group tuples by entity type
      const tuplesByEntityType = new Map<string, typeof tuples>();
      for (const tuple of tuples) {
        if (tuple.entityType === "group" && tuple.relation === "member") continue;
        const existing = tuplesByEntityType.get(tuple.entityType) || [];
        existing.push(tuple);
        tuplesByEntityType.set(tuple.entityType, existing);
      }

      // 4. Resolve permissions with ABAC info
      for (const [entityType, entityTuples] of tuplesByEntityType) {
        const model = await this.modelService.getModel(entityType);

        for (const tuple of entityTuples) {
          const entityKey = tuple.entityId === "*"
            ? entityType
            : `${entityType}:${tuple.entityId}`;

          if (!permissions[entityKey]) {
            permissions[entityKey] = [];
          }
          if (!abac_required[entityKey]) {
            abac_required[entityKey] = [];
          }

          // Check if tuple has a condition (tuple-level ABAC)
          const tupleHasCondition = !!tuple.condition;

          if (model?.permissions) {
            for (const [permName, permDef] of Object.entries(model.permissions)) {
              if (this.relationGrantsPermission(tuple.relation, permDef.relation, model.relations)) {
                if (!permissions[entityKey].includes(permName)) {
                  permissions[entityKey].push(permName);

                  // Check if permission has ABAC policy (permission-level ABAC)
                  const permissionHasPolicy = !!permDef.policy && permDef.policyEngine === "lua";

                  if ((permissionHasPolicy || tupleHasCondition) && !abac_required[entityKey].includes(permName)) {
                    abac_required[entityKey].push(permName);
                  }
                }
              }
            }
          }

          // Include raw relation
          if (!permissions[entityKey].includes(tuple.relation)) {
            permissions[entityKey].push(tuple.relation);
            if (tupleHasCondition && !abac_required[entityKey].includes(tuple.relation)) {
              abac_required[entityKey].push(tuple.relation);
            }
          }
        }
      }

      // Clean up empty entries
      for (const key of Object.keys(abac_required)) {
        if (abac_required[key].length === 0) {
          delete abac_required[key];
        }
      }

      return { permissions, abac_required };
    } catch (error) {
      console.error("PermissionService.resolveAllPermissionsWithABACInfo error:", error);
      return { permissions: {}, abac_required: {} };
    }
  }

  /**
   * Get the highest platform access level for a user on a client.
   * Returns: 'owner' | 'admin' | 'use' | null
   * Supports group inheritance.
   */
  async getPlatformAccessLevel(userId: string, clientId: string): Promise<string | null> {
    try {
      // 0. Global Admin Check
      const user = await this.userRepo.findById(userId);
      if (user && user.role === "admin") {
        return "owner";
      }

      // 1. Expand subjects
      const subjects = await this.expandSubjects("user", userId);

      // 2. Find tuples for this client
      const tuples = await this.tupleRepo.findByEntity("oauth_client", clientId);

      // 3. Filter tuples matching any of our subjects
      const relevantTuples = tuples.filter(t =>
        subjects.some(s => s.type === t.subjectType && s.id === t.subjectId)
      );

      // 4. Determine highest level
      if (relevantTuples.some(t => t.relation === "owner")) return "owner";
      if (relevantTuples.some(t => t.relation === "admin")) return "admin";
      if (relevantTuples.some(t => t.relation === "use")) return "use";

      return null;
    } catch (error) {
      console.error("PermissionService.getPlatformAccessLevel error:", error);
      return null;
    }
  }

  private getImpliedRelations(
    relationMap: Record<string, string[] | { union?: string[]; subjectParams?: { hierarchy?: boolean } }>,
    target: string
  ): string[] {
    const result = new Set<string>();
    const queue = [target];
    result.add(target);

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Find all relations that imply 'current'
      const def = relationMap[current];
      let impliers: string[] = [];

      if (Array.isArray(def)) {
        impliers = def;
      } else if (def && typeof def === "object" && def.union) {
        impliers = def.union;
      }

      for (const implier of impliers) {
        if (!result.has(implier)) {
          result.add(implier);
          queue.push(implier);
        }
      }
    }
    return Array.from(result);
  }

  private relationGrantsPermission(
    grantedRelation: string,
    requiredRelation: string,
    relations: Record<string, string[] | { union?: string[]; subjectParams?: { hierarchy?: boolean } }>
  ): boolean {
    // Direct match
    if (grantedRelation === requiredRelation) return true;

    // Check if grantedRelation implies requiredRelation
    const def = relations[requiredRelation];
    let impliedBy: string[] = [];

    if (Array.isArray(def)) {
      impliedBy = def;
    } else if (def && typeof def === "object" && def.union) {
      impliedBy = def.union;
    }

    if (impliedBy.includes(grantedRelation)) return true;

    // Transitivity
    for (const implier of impliedBy) {
      if (this.relationGrantsPermission(grantedRelation, implier, relations)) {
        return true;
      }
    }

    return false;
  }
  /**
   * Evaluate ABAC policy with priority: tuple-level condition > permission-level policy.
   * Logs all policy evaluations to audit log.
   * 
   * @param tupleCondition - The Lua script from the tuple (if any)
   * @param permDef - The permission definition from the authorization model
   * @param context - Runtime context for ABAC evaluation
   * @param auditInfo - Info for audit logging
   */
  private async evaluatePolicy(
    tupleCondition: string | null | undefined,
    permDef: { policy?: string; policyEngine?: "lua" },
    context: Record<string, unknown>,
    auditInfo?: {
      entityType: string;
      entityId: string;
      permission: string;
      subjectType: string;
      subjectId: string;
    }
  ): Promise<boolean> {
    const startTime = performance.now();
    let policySource: "tuple" | "permission" | null = null;
    let policyScript: string | undefined;
    let result: boolean;
    let errorMessage: string | undefined;

    try {
      // Priority 1: Use tuple-level condition if present
      if (tupleCondition) {
        policySource = "tuple";
        policyScript = tupleCondition;
        result = await this.policyEngine.execute(tupleCondition, context);
      }
      // Priority 2: Fall back to permission-level policy
      else if (permDef.policy && permDef.policyEngine === "lua") {
        policySource = "permission";
        policyScript = permDef.policy;
        result = await this.policyEngine.execute(permDef.policy, context);
      }
      // No policy defined - allow access
      else {
        result = true;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      result = false;
    }

    const executionTimeMs = Math.round(performance.now() - startTime);

    // Log to audit if a policy was actually evaluated
    if (policySource && auditInfo) {
      abacRepository.logPolicyEvaluation({
        entityType: auditInfo.entityType,
        entityId: auditInfo.entityId,
        permission: auditInfo.permission,
        subjectType: auditInfo.subjectType,
        subjectId: auditInfo.subjectId,
        policySource,
        policyScript,
        result: errorMessage ? "error" : result ? "allowed" : "denied",
        errorMessage,
        context,
        executionTimeMs,
      }).catch(err => console.error("Failed to log ABAC audit:", err));
    }

    return result;
  }
}