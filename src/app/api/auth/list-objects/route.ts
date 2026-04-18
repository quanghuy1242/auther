import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  ListObjectsRequestError,
  PermissionService,
} from "@/lib/auth/permission-service";
import { UserRepository } from "@/lib/repositories/user-repository";

interface ListObjectsInput {
  userId?: string;
  entityType: string;
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

function mapListObjectItem(item: {
  entityId: string;
  abac_required: boolean;
  tupleIds: string[];
}): {
  entityId: string;
  abac_required: boolean;
  abacRequired: boolean;
  tupleIds: string[];
  tupleId: string;
} {
  return {
    entityId: item.entityId,
    abac_required: item.abac_required,
    abacRequired: item.abac_required,
    tupleIds: item.tupleIds,
    tupleId: item.tupleIds[0] ?? "",
  };
}

function handleListObjectsError(error: unknown): NextResponse {
  if (error instanceof ListObjectsRequestError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status }
    );
  }

  console.error("[list-objects] Error:", error);
  return NextResponse.json(
    { error: "internal_error", message: "An unexpected error occurred" },
    { status: 500 }
  );
}

async function handleListObjectsRequest(input: ListObjectsInput): Promise<NextResponse> {
  const _headers = await headers();

  const { entityType, permission, cursor } = input;
  if (!entityType || !permission) {
    return NextResponse.json(
      {
        error: "missing_fields",
        message: "entityType and permission are required",
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

  let resolvedUserId = input.userId;
  const userRepository = new UserRepository();
  const permissionService = new PermissionService();

  const headerApiKey = _headers.get("x-api-key");
  const authHeader = _headers.get("authorization");

  if (headerApiKey) {
    const verification = await auth.api.verifyApiKey({
      body: { key: headerApiKey },
      headers: _headers,
    });

    if (!verification || !verification.valid || !verification.key) {
      return NextResponse.json(
        { error: "invalid_api_key", message: "The provided API key is invalid or expired" },
        { status: 401 }
      );
    }

    const ownerUserId = verification.key.userId;
    if (!ownerUserId) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "API key is not associated with an owning user",
        },
        { status: 403 }
      );
    }

    const owner = await userRepository.findById(ownerUserId);
    if (!owner) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "API key owner was not found",
        },
        { status: 403 }
      );
    }

    if (!resolvedUserId) {
      resolvedUserId = ownerUserId;
    }

    const isOwnerAdmin = owner.role === "admin";
    if (!isOwnerAdmin && resolvedUserId !== ownerUserId) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "API key can only list objects for its owner unless owner is admin",
        },
        { status: 403 }
      );
    }

    const keyClientId =
      typeof verification.key.metadata?.oauth_client_id === "string"
        ? verification.key.metadata.oauth_client_id
        : null;
    const namespacedPrefix = keyClientId ? `client_${keyClientId}:` : null;
    const exactClientEntityType = keyClientId ? `client_${keyClientId}` : null;

    if (!keyClientId || !namespacedPrefix || !exactClientEntityType) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "API key is missing client scope metadata",
        },
        { status: 403 }
      );
    }

    if (
      entityType !== exactClientEntityType &&
      !entityType.startsWith(namespacedPrefix)
    ) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "API key cannot list objects outside its client scope",
        },
        { status: 403 }
      );
    }

    const keyCanList = await permissionService.checkPermission(
      "apikey",
      verification.key.id,
      entityType,
      "*",
      permission
    );

    if (!keyCanList) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "API key is missing required permission for this list-objects query",
        },
        { status: 403 }
      );
    }
  } else if (authHeader?.startsWith("Bearer ")) {
    const session = await auth.api.getSession({ headers: _headers });
    if (!session?.user) {
      return NextResponse.json(
        { error: "invalid_token", message: "Invalid or expired session token" },
        { status: 401 }
      );
    }

    const sessionUserId = session.user.id;
    const sessionUserRole = "role" in session.user ? session.user.role : undefined;

    if (!resolvedUserId) {
      resolvedUserId = sessionUserId;
    }

    if (resolvedUserId !== sessionUserId && sessionUserRole !== "admin") {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "Cannot list objects for another user without admin role",
        },
        { status: 403 }
      );
    }
  } else {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing authentication requirements" },
      { status: 401 }
    );
  }

  if (!resolvedUserId) {
    return NextResponse.json(
      { error: "missing_fields", message: "userId is required" },
      { status: 400 }
    );
  }

  const result = await permissionService.listObjectsWithABACInfo({
    userId: resolvedUserId,
    entityType,
    permission,
    cursor,
    limit: parsedLimit ?? undefined,
  });

  return NextResponse.json({
    userId: resolvedUserId,
    entityType,
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

/**
 * GET /api/auth/list-objects
 *
 * Query params:
 * - userId: optional for bearer auth (defaults to current user) and optional for API key auth (defaults to key owner)
 * - entityType: required
 * - permission: required
 * - limit: optional (1-200, default 100)
 * - cursor: optional lexicographic cursor (entityId)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;

    return await handleListObjectsRequest({
      userId: getOptionalTrimmedString(searchParams.get("userId")),
      entityType: getOptionalTrimmedString(searchParams.get("entityType")) ?? "",
      permission: getOptionalTrimmedString(searchParams.get("permission")) ?? "",
      cursor: getOptionalTrimmedString(searchParams.get("cursor")),
      rawLimit: searchParams.get("limit"),
    });
  } catch (error) {
    return handleListObjectsError(error);
  }
}

/**
 * POST /api/auth/list-objects
 *
 * Request body:
 * - userId: optional for bearer auth (defaults to current user) and optional for API key auth (defaults to key owner)
 * - entityType: required
 * - permission: required
 * - limit: optional (1-200, default 100)
 * - cursor: optional lexicographic cursor (entityId)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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

    return await handleListObjectsRequest({
      userId: getOptionalTrimmedString(payload.userId),
      entityType: getOptionalTrimmedString(payload.entityType) ?? "",
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
