"use server";

import { db } from "@/lib/db";
import { jwks } from "@/db/schema";
import { desc } from "drizzle-orm";
import { rotateJwksIfNeeded } from "@/lib/jwks-rotation";
import { JWKS_RETENTION_WINDOW_MS } from "@/lib/constants";

export interface JwksKey {
  id: string;
  publicKey: string;
  createdAt: Date;
  age: number;
  status: "ok" | "breached";
}

export interface RotationResult {
  success: boolean;
  message?: string;
  rotated: boolean;
  prunedCount: number;
  latestKeyId?: string | null;
}

/**
 * Fetch all JWKS keys from database
 */
export async function getJwksKeys(): Promise<JwksKey[]> {
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
    console.error("Failed to fetch JWKS keys:", error);
    return [];
  }
}

/**
 * Rotate JWKS keys
 */
export async function rotateKeys(): Promise<RotationResult> {
  try {
    const result = await rotateJwksIfNeeded();

    return {
      success: true,
      rotated: result.rotated,
      prunedCount: result.pruned,
      latestKeyId: result.latestKeyId,
      message: result.rotated
        ? `Successfully rotated keys. Pruned ${result.pruned} old keys.`
        : "No rotation needed at this time.",
    };
  } catch (error) {
    console.error("Failed to rotate JWKS keys:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to rotate keys",
      rotated: false,
      prunedCount: 0,
    };
  }
}
