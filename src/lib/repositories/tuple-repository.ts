import { db } from "@/lib/db";
import { accessTuples } from "@/db/rebac-schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  emitGrantConditionUpdatedEvent,
  emitGrantCreatedEvent,
  emitGrantRevokedEvent,
} from "@/lib/webhooks/grant-events";

export interface Tuple {
  id: string;
  entityType: string;
  entityTypeId?: string | null;  // FK to authorization_models.id - set for scoped perms, null for platform
  entityId: string;
  relation: string;
  subjectType: string;
  subjectId: string;
  subjectRelation?: string | null;
  condition?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTupleParams = Omit<Tuple, "id" | "createdAt" | "updatedAt">;

type GrantWebhookSubjectType = "user" | "group" | "apikey";

function isGrantWebhookSubjectType(subjectType: string): subjectType is GrantWebhookSubjectType {
  return subjectType === "user" || subjectType === "group" || subjectType === "apikey";
}

export class TupleRepository {
  private buildTupleId(params: CreateTupleParams): string {
    const hashInput = [
      params.entityType,
      params.entityId,
      params.relation,
      params.subjectType,
      params.subjectId,
      params.subjectRelation ?? "",
    ].join("|");

    const digest = createHash("sha256").update(hashInput).digest("hex").slice(0, 40);
    return `tpl_${digest}`;
  }

  private shouldEmitGrantWebhook(tuple: Tuple): tuple is Tuple & { subjectType: GrantWebhookSubjectType } {
    if (!isGrantWebhookSubjectType(tuple.subjectType)) {
      return false;
    }

    // Group membership changes have dedicated group.member.* events.
    if (tuple.entityType === "group" && tuple.relation === "member") {
      return false;
    }

    // Preserve existing behavior for apikey scoped tuples.
    if (tuple.subjectType === "apikey") {
      return tuple.entityType === "oauth_client" && tuple.relation === "full_access";
    }

    return true;
  }

  private emitGrantCreated(tuple: Tuple): void {
    if (!this.shouldEmitGrantWebhook(tuple)) {
      return;
    }

    void emitGrantCreatedEvent({
      tupleId: tuple.id,
      subjectType: tuple.subjectType,
      subjectId: tuple.subjectId,
      entityType: tuple.entityType,
      entityId: tuple.entityId,
      relation: tuple.relation,
      hasCondition: !!tuple.condition,
    });
  }

  private emitGrantRevoked(tuple: Tuple): void {
    if (!this.shouldEmitGrantWebhook(tuple)) {
      return;
    }

    void emitGrantRevokedEvent({
      tupleId: tuple.id,
      subjectType: tuple.subjectType,
      subjectId: tuple.subjectId,
      entityType: tuple.entityType,
      entityId: tuple.entityId,
      relation: tuple.relation,
      hasCondition: !!tuple.condition,
    });
  }

  private emitGrantConditionUpdated(
    tuple: Tuple,
    previousHasCondition: boolean,
    hasCondition: boolean
  ): void {
    if (!this.shouldEmitGrantWebhook(tuple)) {
      return;
    }

    void emitGrantConditionUpdatedEvent({
      tupleId: tuple.id,
      subjectType: tuple.subjectType,
      subjectId: tuple.subjectId,
      entityType: tuple.entityType,
      entityId: tuple.entityId,
      relation: tuple.relation,
      previousHasCondition,
      hasCondition,
    });
  }

  /**
   * Create a new access tuple (grant permission)
   */
  async create(params: CreateTupleParams): Promise<Tuple | null> {
    try {
      const id = this.buildTupleId(params);
      const [tuple] = await db
        .insert(accessTuples)
        .values({
          id,
          ...params,
        })
        .onConflictDoNothing({ target: accessTuples.id })
        .returning();

      if (tuple) {
        this.emitGrantCreated(tuple);
        return tuple;
      }

      return await this.findById(id);
    } catch (error) {
      console.error("TupleRepository.create error:", error);
      return null;
    }
  }

  /**
   * Delete a specific tuple (revoke permission)
   */
  async delete(params: Omit<CreateTupleParams, "subjectRelation"> & { subjectRelation?: string | null }): Promise<boolean> {
    try {
      const conditions = [
        eq(accessTuples.entityType, params.entityType),
        eq(accessTuples.entityId, params.entityId),
        eq(accessTuples.relation, params.relation),
        eq(accessTuples.subjectType, params.subjectType),
        eq(accessTuples.subjectId, params.subjectId),
      ];

      if (params.subjectRelation) {
        conditions.push(eq(accessTuples.subjectRelation, params.subjectRelation));
      } else {
        conditions.push(sql`${accessTuples.subjectRelation} IS NULL`);
      }

      const result = await db
        .delete(accessTuples)
        .where(and(...conditions))
        .returning();

      for (const tuple of result) {
        this.emitGrantRevoked(tuple);
      }

      return result.length > 0;
    } catch (error) {
      console.error("TupleRepository.delete error:", error);
      return false;
    }
  }

  /**
   * Find a specific tuple (check if direct permission exists)
   */
  async findExact(params: Omit<CreateTupleParams, "subjectRelation"> & { subjectRelation?: string | null }): Promise<Tuple | null> {
    try {
      const conditions = [
        eq(accessTuples.entityType, params.entityType),
        eq(accessTuples.entityId, params.entityId),
        eq(accessTuples.relation, params.relation),
        eq(accessTuples.subjectType, params.subjectType),
        eq(accessTuples.subjectId, params.subjectId),
      ];

      if (params.subjectRelation) {
        conditions.push(eq(accessTuples.subjectRelation, params.subjectRelation));
      } else {
        conditions.push(sql`${accessTuples.subjectRelation} IS NULL`);
      }

      const [tuple] = await db
        .select()
        .from(accessTuples)
        .where(and(...conditions))
        .limit(1);

      return tuple || null;
    } catch (error) {
      console.error("TupleRepository.findExact error:", error);
      return null;
    }
  }

  /**
   * Find all tuples for a given subject (What can this user do?)
   */
  async findBySubject(subjectType: string, subjectId: string): Promise<Tuple[]> {
    try {
      return await db
        .select()
        .from(accessTuples)
        .where(
          and(
            eq(accessTuples.subjectType, subjectType),
            eq(accessTuples.subjectId, subjectId)
          )
        );
    } catch (error) {
      console.error("TupleRepository.findBySubject error:", error);
      return [];
    }
  }

  /**
   * Find all tuples for a given subject and throw on data access errors.
   * Use this in fail-closed paths where returning [] would hide a DB failure.
   */
  async findBySubjectStrict(subjectType: string, subjectId: string): Promise<Tuple[]> {
    return await db
      .select()
      .from(accessTuples)
      .where(
        and(
          eq(accessTuples.subjectType, subjectType),
          eq(accessTuples.subjectId, subjectId)
        )
      );
  }

  /**
   * Find tuples for a subject filtered by entity type and relation.
   * Strict variant: throws on data access errors.
   */
  async findBySubjectAndEntityTypeAndRelation(
    subjectType: string,
    subjectId: string,
    entityType: string,
    relation: string
  ): Promise<Tuple[]> {
    return await db
      .select()
      .from(accessTuples)
      .where(
        and(
          eq(accessTuples.subjectType, subjectType),
          eq(accessTuples.subjectId, subjectId),
          eq(accessTuples.entityType, entityType),
          eq(accessTuples.relation, relation)
        )
      );
  }

  /**
   * Find all tuples for multiple subjects (e.g. User + their Groups)
   */
  async findBySubjects(subjects: { type: string; id: string }[]): Promise<Tuple[]> {
    try {
      return await this.findBySubjectsStrict(subjects);
    } catch (error) {
      console.error("TupleRepository.findBySubjects error:", error);
      return [];
    }
  }

  /**
   * Find all tuples for multiple subjects and throw on data access errors.
   * Use this in fail-closed API paths where empty results must not mask DB failures.
   */
  async findBySubjectsStrict(subjects: { type: string; id: string }[]): Promise<Tuple[]> {
    if (subjects.length === 0) return [];

    // Construct OR conditions for each subject
    // WHERE (subjectType = 'user' AND subjectId = '123') OR (subjectType = 'group' AND subjectId = '456') ...
    const conditions = subjects.map(s =>
      and(
        eq(accessTuples.subjectType, s.type),
        eq(accessTuples.subjectId, s.id)
      )
    );

    // Use Drizzle's `or` helper
    const { or } = await import("drizzle-orm");

    return await db
      .select()
      .from(accessTuples)
      .where(or(...conditions));
  }

  /**
   * Find tuples for the provided subjects within a single entity type.
   * Ordered by entityId to support streaming pagination at the caller.
   */
  async findBySubjectsAndEntityTypeStrict(
    subjects: { type: string; id: string }[],
    entityType: string
  ): Promise<Tuple[]> {
    if (subjects.length === 0) return [];

    const conditions = subjects.map(s =>
      and(
        eq(accessTuples.subjectType, s.type),
        eq(accessTuples.subjectId, s.id)
      )
    );

    const { or } = await import("drizzle-orm");

    return await db
      .select()
      .from(accessTuples)
      .where(
        and(
          eq(accessTuples.entityType, entityType),
          or(...conditions)
        )
      )
      .orderBy(accessTuples.entityId, accessTuples.id);
  }

  /**
   * Find all tuples for a given entity (Who has access to this?)
   */
  async findByEntity(entityType: string, entityId: string): Promise<Tuple[]> {
    try {
      return await this.findByEntityStrict(entityType, entityId);
    } catch (error) {
      console.error("TupleRepository.findByEntity error:", error);
      return [];
    }
  }

  /**
   * Find all tuples for a given entity and throw on data access errors.
   */
  async findByEntityStrict(entityType: string, entityId: string): Promise<Tuple[]> {
    return await db
      .select()
      .from(accessTuples)
      .where(
        and(
          eq(accessTuples.entityType, entityType),
          eq(accessTuples.entityId, entityId)
        )
      );
  }

  /**
   * Find tuples in a client's scope with cursor pagination.
   * When entityType/entityId are provided, returns tuples only for that entity.
   */
  async findByClientScopePaginated(params: {
    clientId: string;
    cursor?: string;
    limit: number;
    entityType?: string;
    entityId?: string;
  }): Promise<{ tuples: Tuple[]; nextCursor: string | null; hasMore: boolean }> {
    try {
      const pageSize = Math.max(1, params.limit);
      const exactClientEntityType = `client_${params.clientId}`;
      const namespacedClientPrefix = `${exactClientEntityType}:`;

      const scopeCondition =
        params.entityType && params.entityId
          ? and(
              eq(accessTuples.entityType, params.entityType),
              eq(accessTuples.entityId, params.entityId)
            )
          : sql`(
              ${accessTuples.entityType} = ${exactClientEntityType}
              OR ${accessTuples.entityType} LIKE ${namespacedClientPrefix + "%"}
            )`;

      const whereCondition = params.cursor
        ? and(scopeCondition, gt(accessTuples.id, params.cursor))
        : scopeCondition;

      const pagedTuples = await db
        .select()
        .from(accessTuples)
        .where(whereCondition)
        .orderBy(accessTuples.id)
        .limit(pageSize + 1);

      const hasMore = pagedTuples.length > pageSize;
      const tuples = hasMore ? pagedTuples.slice(0, pageSize) : pagedTuples;
      const nextCursor = hasMore ? tuples[tuples.length - 1]?.id ?? null : null;

      return { tuples, nextCursor, hasMore };
    } catch (error) {
      console.error("TupleRepository.findByClientScopePaginated error:", error);
      return { tuples: [], nextCursor: null, hasMore: false };
    }
  }

  /**
   * Find tuples matching specific entity and relation (e.g., "Who are the admins of client_123?")
   */
  async findByEntityAndRelation(entityType: string, entityId: string, relation: string): Promise<Tuple[]> {
    try {
      return await db
        .select()
        .from(accessTuples)
        .where(
          and(
            eq(accessTuples.entityType, entityType),
            eq(accessTuples.entityId, entityId),
            eq(accessTuples.relation, relation)
          )
        );
    } catch (error) {
      console.error("TupleRepository.findByEntityAndRelation error:", error);
      return [];
    }
  }

  /**
   * Delete all tuples associated with an entity (Cleanup when entity is deleted)
   */
  async deleteByEntity(entityType: string, entityId: string): Promise<void> {
    try {
      const removed = await db
        .delete(accessTuples)
        .where(
          and(
            eq(accessTuples.entityType, entityType),
            eq(accessTuples.entityId, entityId)
          )
        )
        .returning();

      for (const tuple of removed) {
        this.emitGrantRevoked(tuple);
      }
    } catch (error) {
      console.error("TupleRepository.deleteByEntity error:", error);
    }
  }

  /**
   * Count how many tuples use a specific relation for a specific entity type.
   * Used for dependency safety checks.
   */
  async countByRelation(entityType: string, relation: string): Promise<number> {
    try {
      return await this.countByRelationStrict(entityType, relation);
    } catch (error) {
      console.error("TupleRepository.countByRelation error:", error);
      return 0;
    }
  }

  /**
   * Strict count for tuples by entity type and relation.
   * Throws on data access errors for fail-closed call sites.
   */
  async countByRelationStrict(entityType: string, relation: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(accessTuples)
      .where(
        and(
          eq(accessTuples.entityType, entityType),
          eq(accessTuples.relation, relation)
        )
      );

    return result?.count || 0;
  }

  /**
   * Find all tuples for a given entity type (e.g., all tuples for "client_abc123")
   */
  async findByEntityType(entityType: string): Promise<Tuple[]> {
    try {
      return await db
        .select()
        .from(accessTuples)
        .where(eq(accessTuples.entityType, entityType));
    } catch (error) {
      console.error("TupleRepository.findByEntityType error:", error);
      return [];
    }
  }

  /**
   * Find all tuples for entity types matching a prefix
   * (e.g., find all "client_abc123:*" entity types)
   */
  async findByEntityTypePrefix(entityTypePrefix: string): Promise<Tuple[]> {
    try {
      return await db
        .select()
        .from(accessTuples)
        .where(sql`${accessTuples.entityType} LIKE ${entityTypePrefix + '%'}`);
    } catch (error) {
      console.error("TupleRepository.findByEntityTypePrefix error:", error);
      return [];
    }
  }

  /**
   * Create a tuple if it doesn't already exist (idempotent)
   * Returns the tuple and whether it was newly created
   */
  async createIfNotExists(params: CreateTupleParams): Promise<{ tuple: Tuple; created: boolean }> {
    try {
      // Check if tuple already exists
      const existing = await this.findExact(params);
      if (existing) {
        return { tuple: existing, created: false };
      }

      // Create new tuple
      const tuple = await this.create(params);
      if (!tuple) {
        throw new Error("Failed to create tuple");
      }
      return { tuple, created: true };
    } catch (error) {
      console.error("TupleRepository.createIfNotExists error:", error);
      throw error;
    }
  }

  /**
   * Ensure a subject has exactly one relation on a specific entity.
   * Deletes other relations and guarantees the target relation exists atomically.
   */
  async replaceSubjectRelationAtomic(params: {
    entityType: string;
    entityId: string;
    relation: string;
    subjectType: string;
    subjectId: string;
    subjectRelation?: string | null;
    entityTypeId?: string | null;
    condition?: string | null;
  }): Promise<{ created: boolean; removedCount: number }> {
    const relationCondition = params.subjectRelation
      ? eq(accessTuples.subjectRelation, params.subjectRelation)
      : sql`${accessTuples.subjectRelation} IS NULL`;

    const transactionResult = await db.transaction(async (tx) => {
      const removed = await tx
        .delete(accessTuples)
        .where(
          and(
            eq(accessTuples.entityType, params.entityType),
            eq(accessTuples.entityId, params.entityId),
            eq(accessTuples.subjectType, params.subjectType),
            eq(accessTuples.subjectId, params.subjectId),
            relationCondition,
            sql`${accessTuples.relation} <> ${params.relation}`
          )
        )
        .returning();

      const [existingTarget] = await tx
        .select()
        .from(accessTuples)
        .where(
          and(
            eq(accessTuples.entityType, params.entityType),
            eq(accessTuples.entityId, params.entityId),
            eq(accessTuples.relation, params.relation),
            eq(accessTuples.subjectType, params.subjectType),
            eq(accessTuples.subjectId, params.subjectId),
            relationCondition
          )
        )
        .limit(1);

      if (existingTarget) {
        return {
          removed,
          createdTuple: null as Tuple | null,
          created: false,
        };
      }

      const [createdTuple] = await tx
        .insert(accessTuples)
        .values({
          id: crypto.randomUUID(),
          entityType: params.entityType,
          entityTypeId: params.entityTypeId ?? null,
          entityId: params.entityId,
          relation: params.relation,
          subjectType: params.subjectType,
          subjectId: params.subjectId,
          subjectRelation: params.subjectRelation ?? null,
          condition: params.condition ?? null,
        })
        .returning();

      if (!createdTuple) {
        throw new Error("Failed to create replacement tuple");
      }

      return {
        removed,
        createdTuple,
        created: true,
      };
    });

    for (const tuple of transactionResult.removed) {
      this.emitGrantRevoked(tuple);
    }

    if (transactionResult.createdTuple) {
      this.emitGrantCreated(transactionResult.createdTuple);
    }

    return {
      created: transactionResult.created,
      removedCount: transactionResult.removed.length,
    };
  }

  /**
   * Delete a tuple by its ID
   */
  async deleteById(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(accessTuples)
        .where(eq(accessTuples.id, id))
        .returning();

      for (const tuple of result) {
        this.emitGrantRevoked(tuple);
      }

      return result.length > 0;
    } catch (error) {
      console.error("TupleRepository.deleteById error:", error);
      return false;
    }
  }

  /**
   * Find a tuple by its ID
   */
  async findById(id: string): Promise<Tuple | null> {
    try {
      const [tuple] = await db
        .select()
        .from(accessTuples)
        .where(eq(accessTuples.id, id))
        .limit(1);

      return tuple || null;
    } catch (error) {
      console.error("TupleRepository.findById error:", error);
      return null;
    }
  }

  /**
   * Count tuples for a specific entity and relation
   * Used to check if granting/revoking would affect existing data
   */
  async countByEntityAndRelation(entityType: string, entityId: string, relation: string): Promise<number> {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(accessTuples)
        .where(
          and(
            eq(accessTuples.entityType, entityType),
            eq(accessTuples.entityId, entityId),
            eq(accessTuples.relation, relation)
          )
        );

      return result?.count || 0;
    } catch (error) {
      console.error("TupleRepository.countByEntityAndRelation error:", error);
      return 0;
    }
  }

  /**
   * Delete all tuples for a subject (used when removing platform access with cascade)
   */
  async deleteBySubjectAndEntityType(
    subjectType: string,
    subjectId: string,
    entityType: string
  ): Promise<number> {
    try {
      const result = await db
        .delete(accessTuples)
        .where(
          and(
            eq(accessTuples.subjectType, subjectType),
            eq(accessTuples.subjectId, subjectId),
            eq(accessTuples.entityType, entityType)
          )
        )
        .returning();

      for (const tuple of result) {
        this.emitGrantRevoked(tuple);
      }

      return result.length;
    } catch (error) {
      console.error("TupleRepository.deleteBySubjectAndEntityType error:", error);
      return 0;
    }
  }

  /**
   * Delete all tuples for a subject where entity type matches a prefix.
   * Includes the legacy exact entity type without the trailing ':' when present.
   */
  async deleteBySubjectAndEntityTypePrefix(
    subjectType: string,
    subjectId: string,
    entityTypePrefix: string
  ): Promise<number> {
    try {
      const normalizedPrefix = entityTypePrefix.endsWith(":")
        ? entityTypePrefix
        : `${entityTypePrefix}:`;
      const legacyEntityType = normalizedPrefix.slice(0, -1);

      const result = await db
        .delete(accessTuples)
        .where(
          and(
            eq(accessTuples.subjectType, subjectType),
            eq(accessTuples.subjectId, subjectId),
            sql`(
              ${accessTuples.entityType} = ${legacyEntityType}
              OR ${accessTuples.entityType} LIKE ${normalizedPrefix + "%"}
            )`
          )
        )
        .returning();

      for (const tuple of result) {
        this.emitGrantRevoked(tuple);
      }

      return result.length;
    } catch (error) {
      console.error("TupleRepository.deleteBySubjectAndEntityTypePrefix error:", error);
      return 0;
    }
  }

  /**
   * Delete all tuples for a specific subject (Revoke all access for a user/api key)
   */
  async deleteBySubject(subjectType: string, subjectId: string): Promise<number> {
    try {
      const result = await db
        .delete(accessTuples)
        .where(
          and(
            eq(accessTuples.subjectType, subjectType),
            eq(accessTuples.subjectId, subjectId)
          )
        )
        .returning();

      for (const tuple of result) {
        this.emitGrantRevoked(tuple);
      }

      return result.length;
    } catch (error) {
      console.error("TupleRepository.deleteBySubject error:", error);
      return 0;
    }
  }

  /**
   * Update the entity_type string for all tuples with a given entity_type_id.
   * Used for keeping the denormalized display name in sync after renames.
   */
  async updateEntityTypeString(entityTypeId: string, newEntityType: string): Promise<number> {
    try {
      const result = await db
        .update(accessTuples)
        .set({
          entityType: newEntityType,
          updatedAt: new Date(),
        })
        .where(eq(accessTuples.entityTypeId, entityTypeId))
        .returning({ id: accessTuples.id });

      return result.length;
    } catch (error) {
      console.error("TupleRepository.updateEntityTypeString error:", error);
      return 0;
    }
  }

  /**
   * Update a tuple-level condition and emit a condition-updated webhook event.
   */
  async updateConditionById(id: string, condition: string | null): Promise<Tuple | null> {
    try {
      const previous = await this.findById(id);
      if (!previous) {
        return null;
      }

      const normalizedCondition = condition && condition.trim().length > 0 ? condition : null;
      const previousHasCondition = !!previous.condition;
      const nextHasCondition = !!normalizedCondition;

      if ((previous.condition ?? null) === normalizedCondition) {
        return previous;
      }

      const [updated] = await db
        .update(accessTuples)
        .set({
          condition: normalizedCondition,
          updatedAt: new Date(),
        })
        .where(eq(accessTuples.id, id))
        .returning();

      if (!updated) {
        return null;
      }

      this.emitGrantConditionUpdated(updated, previousHasCondition, nextHasCondition);

      return updated;
    } catch (error) {
      console.error("TupleRepository.updateConditionById error:", error);
      return null;
    }
  }
}