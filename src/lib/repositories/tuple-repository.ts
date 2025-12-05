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
   * Find all tuples for multiple subjects (e.g. User + their Groups)
   */
  async findBySubjects(subjects: { type: string; id: string }[]): Promise<Tuple[]> {
    try {
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
    } catch (error) {
      console.error("TupleRepository.findBySubjects error:", error);
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
   * Delete a tuple by its ID
   */
  async deleteById(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(accessTuples)
        .where(eq(accessTuples.id, id))
        .returning({ id: accessTuples.id });

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
        .returning({ id: accessTuples.id });

      return result.length;
    } catch (error) {
      console.error("TupleRepository.deleteBySubjectAndEntityType error:", error);
      return 0;
    }
  }
}