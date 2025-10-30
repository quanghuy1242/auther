"use server";

import { rotateJwksIfNeeded } from "@/lib/jwks-rotation";
import { jwksRepository } from "@/lib/repositories";
import type { JwksKeyWithStatus } from "@/lib/repositories";

// Re-export type
export type { JwksKeyWithStatus as JwksKey };

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
export async function getJwksKeys(): Promise<JwksKeyWithStatus[]> {
  try {
    return await jwksRepository.findAllWithStatus();
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
