import { db } from "@/lib/db";
import { jwks } from "@/db/schema";
import { desc } from "drizzle-orm";
import { JWKS_RETENTION_WINDOW_MS } from "@/lib/constants";

export interface JwksKeyEntity {
  id: string;
  publicKey: string;
  privateKey: string;
  createdAt: Date;
}

export interface JwksKeyWithStatus extends Omit<JwksKeyEntity, "privateKey"> {
  age: number;
  status: "ok" | "breached";
}

/**
 * JWKS Repository
 * Handles all database operations related to JWKS keys
 */
export class JwksRepository {
  /**
   * Find all JWKS keys
   */
  async findAll(): Promise<JwksKeyEntity[]> {
    try {
      const keys = await db
        .select()
        .from(jwks)
        .orderBy(desc(jwks.createdAt));

      return keys;
    } catch (error) {
      console.error("JwksRepository.findAll error:", error);
      return [];
    }
  }

  /**
   * Find all JWKS keys with status
   */
  async findAllWithStatus(): Promise<JwksKeyWithStatus[]> {
    try {
      const keys = await db
        .select({
          id: jwks.id,
          publicKey: jwks.publicKey,
          createdAt: jwks.createdAt,
        })
        .from(jwks)
        .orderBy(desc(jwks.createdAt));

      const now = Date.now();

      return keys.map((key) => {
        const age = now - key.createdAt.getTime();
        const status = age > JWKS_RETENTION_WINDOW_MS ? "breached" : "ok";

        return {
          ...key,
          age,
          status,
        };
      });
    } catch (error) {
      console.error("JwksRepository.findAllWithStatus error:", error);
      return [];
    }
  }

  /**
   * Get the latest JWKS key
   */
  async findLatest(): Promise<JwksKeyEntity | null> {
    try {
      const [key] = await db
        .select()
        .from(jwks)
        .orderBy(desc(jwks.createdAt))
        .limit(1);

      return key || null;
    } catch (error) {
      console.error("JwksRepository.findLatest error:", error);
      return null;
    }
  }
}
