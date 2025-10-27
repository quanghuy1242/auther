import type { GenericEndpointContext } from "better-auth";
import { createJwk } from "better-auth/plugins";
import { desc, inArray, lte } from "drizzle-orm";

import { jwks } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const JWKS_ROTATION_INTERVAL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const JWKS_RETENTION_WINDOW_MS = JWKS_ROTATION_INTERVAL_MS * 2; // keep old keys for 60 days

type JwkRecord = typeof jwks.$inferSelect;

function getTimestamp(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

async function fetchLatestKey(): Promise<JwkRecord | null> {
  const [latest] = await db
    .select()
    .from(jwks)
    .orderBy(desc(jwks.createdAt))
    .limit(1);

  return latest ?? null;
}

function extractRowsAffected(result: unknown): number {
  if (result && typeof result === "object") {
    const rowsAffected = (result as { rowsAffected?: number }).rowsAffected;
    if (typeof rowsAffected === "number") {
      return rowsAffected;
    }

    const changes = (result as { changes?: number }).changes;
    if (typeof changes === "number") {
      return changes;
    }
  }
  return 0;
}

export type JwksRotationResult = {
  rotated: boolean;
  pruned: number;
  latestKeyId: string | null;
  latestKeyCreatedAt: Date | null;
};

export async function rotateJwksIfNeeded(now = new Date()): Promise<JwksRotationResult> {
  let latestKey = await fetchLatestKey();
  const nowMs = now.getTime();
  const latestKeyAgeMs = latestKey ? nowMs - getTimestamp(latestKey.createdAt) : Number.POSITIVE_INFINITY;

  let rotated = false;

  if (!latestKey || latestKeyAgeMs >= JWKS_ROTATION_INTERVAL_MS) {
    const baseContext = await auth.$context;
    await createJwk({ context: baseContext } as GenericEndpointContext);
    rotated = true;
    latestKey = await fetchLatestKey();
  }

  const retentionThreshold = new Date(nowMs - JWKS_RETENTION_WINDOW_MS);
  const staleKeys = await db
    .select({ id: jwks.id })
    .from(jwks)
    .where(lte(jwks.createdAt, retentionThreshold));

  const idsToDelete = staleKeys
    .map((entry) => entry.id)
    .filter((id) => id && id !== latestKey?.id);

  let pruned = 0;
  if (idsToDelete.length > 0) {
    const deletionResult = await db.delete(jwks).where(inArray(jwks.id, idsToDelete));
    pruned = extractRowsAffected(deletionResult);
  }

  return {
    rotated,
    pruned,
    latestKeyId: latestKey?.id ?? null,
    latestKeyCreatedAt: latestKey?.createdAt ?? null,
  };
}
