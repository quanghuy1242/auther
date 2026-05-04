import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authenticateAuthorizationSpaceApiKey } from "@/lib/auth/space-api-key-auth";
import {
  authorizationModelRepository,
  tupleRepository,
  userRepository,
} from "@/lib/repositories";

interface EntityGrantRecord {
  tupleId: string;
  relation: string;
  subjectType: string;
  subjectId: string;
  userId: string | null;
  userEmail: string | null;
}

const DEFAULT_GRANTS_PAGE_LIMIT = 100;
const MAX_GRANTS_PAGE_LIMIT = 500;

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseLimit(rawLimit: string | null): number | null {
  if (rawLimit === null) {
    return null;
  }

  const parsedLimit = /^\d+$/.test(rawLimit)
    ? Number.parseInt(rawLimit, 10)
    : Number.NaN;

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return Number.NaN;
  }

  return parsedLimit;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ spaceId: string }> }
): Promise<NextResponse> {
  try {
    const _headers = await headers();
    const { spaceId } = await context.params;

    if (!spaceId) {
      return NextResponse.json(
        { error: "missing_fields", message: "spaceId is required" },
        { status: 400 }
      );
    }

    const authResult = await authenticateAuthorizationSpaceApiKey(_headers, spaceId);
    if ("error" in authResult) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const entityTypeName = getNonEmptyString(request.nextUrl.searchParams.get("entityTypeName"));
    const entityId = getNonEmptyString(request.nextUrl.searchParams.get("entityId"));
    const cursor = getNonEmptyString(request.nextUrl.searchParams.get("cursor")) ?? undefined;
    const parsedLimit = parseLimit(request.nextUrl.searchParams.get("limit"));

    if (parsedLimit !== null && Number.isNaN(parsedLimit)) {
      return NextResponse.json(
        {
          error: "invalid_limit",
          message: "limit must be a positive integer",
        },
        { status: 400 }
      );
    }

    if ((entityTypeName && !entityId) || (!entityTypeName && entityId)) {
      return NextResponse.json(
        {
          error: "missing_fields",
          message: "entityTypeName and entityId must both be provided when filtering",
        },
        { status: 400 }
      );
    }

    const model = entityTypeName
      ? await authorizationModelRepository.findBySpaceAndEntityTypeName(spaceId, entityTypeName)
      : null;

    if (entityTypeName && !model) {
      return NextResponse.json(
        {
          error: "unknown_entity_type",
          message: `Entity type '${entityTypeName}' not found in authorization space`,
        },
        { status: 404 }
      );
    }

    const limit = Math.min(parsedLimit ?? DEFAULT_GRANTS_PAGE_LIMIT, MAX_GRANTS_PAGE_LIMIT);
    const tuplePage = await tupleRepository.findByAuthorizationSpacePaginated(
      model && entityId
        ? {
            authorizationSpaceId: spaceId,
            entityType: model.entityType,
            entityId,
            cursor,
            limit,
          }
        : {
            authorizationSpaceId: spaceId,
            cursor,
            limit,
          }
    );

    const userIds = Array.from(
      new Set(
        tuplePage.tuples
          .filter((tuple) => tuple.subjectType === "user")
          .map((tuple) => tuple.subjectId)
      )
    );

    const users = userIds.length > 0 ? await userRepository.findByIds(userIds) : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    const grants: EntityGrantRecord[] = tuplePage.tuples.map((tuple) => ({
      tupleId: tuple.id,
      relation: tuple.relation,
      subjectType: tuple.subjectType,
      subjectId: tuple.subjectId,
      userId: tuple.subjectType === "user" ? tuple.subjectId : null,
      userEmail:
        tuple.subjectType === "user"
          ? usersById.get(tuple.subjectId)?.email ?? null
          : null,
    }));

    return NextResponse.json({
      grants,
      nextCursor: tuplePage.nextCursor,
      hasMore: tuplePage.hasMore,
    });
  } catch (error) {
    console.error("[internal-space-grants:get] Error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
