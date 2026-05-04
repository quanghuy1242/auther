import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authenticateAuthorizationSpaceApiKey } from "@/lib/auth/space-api-key-auth";
import {
  ListObjectsRequestError,
  PermissionService,
} from "@/lib/auth/permission-service";
import { authorizationModelRepository } from "@/lib/repositories";

interface ListObjectsInput {
  userId?: string;
  entityTypeName: string;
  permission: string;
  cursor?: string;
  rawLimit?: string | number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseLimit(rawLimit: string | number | null | undefined): number | null {
  if (rawLimit === null || rawLimit === undefined) {
    return null;
  }

  const parsedLimit =
    typeof rawLimit === "number"
      ? rawLimit
      : /^\d+$/.test(rawLimit)
        ? Number.parseInt(rawLimit, 10)
        : Number.NaN;

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return Number.NaN;
  }

  return parsedLimit;
}

function handleListObjectsError(error: unknown): NextResponse {
  if (error instanceof ListObjectsRequestError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status }
    );
  }

  console.error("[internal-space-list-objects] Error:", error);
  return NextResponse.json(
    { error: "internal_error", message: "An unexpected error occurred" },
    { status: 500 }
  );
}

function mapListObjectItem(item: {
  entityId: string;
  abac_required: boolean;
  tupleIds: string[];
  tuples: Array<{
    tupleId: string;
    relation: string;
  }>;
}) {
  return {
    entityId: item.entityId,
    abac_required: item.abac_required,
    abacRequired: item.abac_required,
    tupleIds: item.tupleIds,
    tupleId: item.tupleIds[0] ?? "",
    tuples: item.tuples,
  };
}

async function handleListObjectsRequest(
  spaceId: string,
  input: ListObjectsInput
): Promise<NextResponse> {
  const _headers = await headers();
  const authResult = await authenticateAuthorizationSpaceApiKey(_headers, spaceId);
  if ("error" in authResult) {
    return NextResponse.json(authResult.error.body, { status: authResult.error.status });
  }

  const { entityTypeName, permission, cursor } = input;
  if (!input.userId || !entityTypeName || !permission) {
    return NextResponse.json(
      {
        error: "missing_fields",
        message: "userId, entityTypeName, and permission are required",
      },
      { status: 400 }
    );
  }

  const parsedLimit = parseLimit(input.rawLimit);
  if (parsedLimit !== null && Number.isNaN(parsedLimit)) {
    return NextResponse.json(
      {
        error: "invalid_limit",
        message: "limit must be a positive integer",
      },
      { status: 400 }
    );
  }

  const model = await authorizationModelRepository.findBySpaceAndEntityTypeName(
    spaceId,
    entityTypeName
  );

  if (!model) {
    return NextResponse.json(
      {
        error: "unknown_entity_type",
        message: `Entity type '${entityTypeName}' not found in authorization space`,
      },
      { status: 404 }
    );
  }

  const permissionService = new PermissionService();
  const result = await permissionService.listObjectsWithABACInfo({
    userId: input.userId,
    entityType: model.entityType,
    permission,
    cursor,
    limit: parsedLimit ?? undefined,
  });

  return NextResponse.json({
    userId: input.userId,
    entityTypeName,
    entityType: model.entityType,
    permission,
    items: result.items.map(mapListObjectItem),
    pagination: {
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      total: result.total,
      limit: result.limit,
    },
    wildcardGrant: result.hasWildcardGrant,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ spaceId: string }> }
): Promise<NextResponse> {
  try {
    const { spaceId } = await context.params;
    const searchParams = request.nextUrl.searchParams;

    return await handleListObjectsRequest(spaceId, {
      userId: getOptionalTrimmedString(searchParams.get("userId")),
      entityTypeName: getOptionalTrimmedString(searchParams.get("entityTypeName")) ?? "",
      permission: getOptionalTrimmedString(searchParams.get("permission")) ?? "",
      cursor: getOptionalTrimmedString(searchParams.get("cursor")),
      rawLimit: searchParams.get("limit"),
    });
  } catch (error) {
    return handleListObjectsError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ spaceId: string }> }
): Promise<NextResponse> {
  try {
    const { spaceId } = await context.params;
    let payload: Record<string, unknown>;

    try {
      const parsedPayload = await request.json();
      if (!isRecord(parsedPayload)) {
        return NextResponse.json(
          { error: "invalid_request", message: "Invalid JSON in request body" },
          { status: 400 }
        );
      }

      payload = parsedPayload;
    } catch {
      return NextResponse.json(
        { error: "invalid_request", message: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    return await handleListObjectsRequest(spaceId, {
      userId: getOptionalTrimmedString(payload.userId),
      entityTypeName: getOptionalTrimmedString(payload.entityTypeName) ?? "",
      permission: getOptionalTrimmedString(payload.permission) ?? "",
      cursor: getOptionalTrimmedString(payload.cursor),
      rawLimit:
        typeof payload.limit === "string" || typeof payload.limit === "number"
          ? payload.limit
          : null,
    });
  } catch (error) {
    return handleListObjectsError(error);
  }
}
