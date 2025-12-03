import { db } from "@/lib/db";
import { accessTuples } from "@/db/rebac-schema";
import { and, eq, sql } from "drizzle-orm";

export interface Tuple {
  id: string;
  entityType: string;
  entityId: string;
  relation: string;
  subjectType: string;
  subjectId: string;
  subjectRelation?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTupleParams = Omit<Tuple, "id" | "createdAt" | "updatedAt">;

export class TupleRepository {
  /**
   * Create a new access tuple (grant permission)
   */
  async create(params: CreateTupleParams): Promise<Tuple | null> {
    try {
      const id = crypto.randomUUID();
      const [tuple] = await db
        .insert(accessTuples)
        .values({
          id,
          ...params,
        })
        .returning();
      
      return tuple;
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
        .returning({ id: accessTuples.id });

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
   * Find all tuples for a given entity (Who has access to this?)
   */
  async findByEntity(entityType: string, entityId: string): Promise<Tuple[]> {
    try {
      return await db
        .select()
        .from(accessTuples)
        .where(
          and(
            eq(accessTuples.entityType, entityType),
            eq(accessTuples.entityId, entityId)
          )
        );
    } catch (error) {
      console.error("TupleRepository.findByEntity error:", error);
      return [];
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
      await db
        .delete(accessTuples)
        .where(
          and(
            eq(accessTuples.entityType, entityType),
            eq(accessTuples.entityId, entityId)
          )
        );
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
    } catch (error) {
      console.error("TupleRepository.countByRelation error:", error);
      return 0;
    }
  }
}