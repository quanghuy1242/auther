import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  buildABACContext,
  buildResourceContext,
  buildUserContext,
} from "@/lib/auth/abac-context";
import { PermissionService } from "@/lib/auth/permission-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toEntityIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * POST /api/auth/check-permission/batch
 *
 * Bearer-token authenticated batch permission evaluation.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const _headers = await headers();
    const authHeader = _headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "unauthorized",
          message: "Bearer token is required for batch permission checks",
        },
        { status: 401 }
      );
    }

    const session = await auth.api.getSession({ headers: _headers });
    if (!session?.user) {
      return NextResponse.json(
        { error: "invalid_token", message: "Invalid or expired session token" },
        { status: 401 }
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsedBody = await request.json();
      if (!isRecord(parsedBody)) {
        return NextResponse.json(
          { error: "invalid_request", message: "Invalid JSON in request body" },
          { status: 400 }
        );
      }
      body = parsedBody;
    } catch {
      return NextResponse.json(
        { error: "invalid_request", message: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const entityType = typeof body.entityType === "string" ? body.entityType.trim() : "";
    const permission = typeof body.permission === "string" ? body.permission.trim() : "";
    const entityIds = toEntityIds(body.entityIds);

    if (!entityType || !permission || entityIds === null) {
      return NextResponse.json(
        {
          error: "missing_fields",
          message: "entityType, entityIds, and permission are required",
        },
        { status: 400 }
      );
    }

    if (entityIds.length === 0) {
      return NextResponse.json({ results: {} });
    }

    const uniqueEntityIds = Array.from(new Set(entityIds));
    const permissionService = new PermissionService();

    const baseContext = isRecord(body.context) ? body.context : {};
    const baseUserContext = isRecord(baseContext.user) ? baseContext.user : {};
    const baseResourceContext = isRecord(baseContext.resource) ? baseContext.resource : {};
    const sessionUserRole = "role" in session.user ? session.user.role : undefined;

    const contextWithoutDerived: Record<string, unknown> = { ...baseContext };
    delete contextWithoutDerived.user;
    delete contextWithoutDerived.resource;
    delete contextWithoutDerived.action;

    const evaluated = await Promise.all(
      uniqueEntityIds.map(async (entityId) => {
        const context = buildABACContext({
          ...contextWithoutDerived,
          user: buildUserContext({
            ...baseUserContext,
            id: session.user.id,
            ...(typeof session.user.name === "string" ? { name: session.user.name } : {}),
            ...(typeof session.user.email === "string" ? { email: session.user.email } : {}),
            ...(typeof sessionUserRole === "string" ? { role: sessionUserRole } : {}),
          }),
          resource: buildResourceContext({
            ...baseResourceContext,
            id: entityId,
            type:
              typeof baseResourceContext.type === "string"
                ? baseResourceContext.type
                : entityType,
          }),
          action: permission,
        });

        const allowed = await permissionService.checkPermission(
          "user",
          session.user.id,
          entityType,
          entityId,
          permission,
          context as Record<string, unknown>
        );

        return [entityId, allowed] as const;
      })
    );

    return NextResponse.json({ results: Object.fromEntries(evaluated) });
  } catch (error) {
    console.error("[check-permission-batch] Error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
