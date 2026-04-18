import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authenticateClientApiKey } from "@/lib/auth/client-api-key-auth";
import {
  authorizationModelRepository,
  tupleRepository,
  userGroupRepository,
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

type CreateGrantRequest = {
  entityTypeName: string;
  entityId: string;
  relation: string;
  subjectType: "user" | "group";
  subjectEmail?: string;
  subjectId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> }
): Promise<NextResponse> {
  try {
    const _headers = await headers();
    const { clientId } = await context.params;

    if (!clientId) {
      return NextResponse.json(
        { error: "missing_fields", message: "clientId is required" },
        { status: 400 }
      );
    }

    const authResult = await authenticateClientApiKey(_headers, clientId);
    if ("error" in authResult) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const entityTypeName = getNonEmptyString(request.nextUrl.searchParams.get("entityTypeName"));
    const entityId = getNonEmptyString(request.nextUrl.searchParams.get("entityId"));

    if (!entityTypeName || !entityId) {
      return NextResponse.json(
        {
          error: "missing_fields",
          message: "entityTypeName and entityId are required",
        },
        { status: 400 }
      );
    }

    const fullEntityType = `client_${clientId}:${entityTypeName}`;
    const tuples = await tupleRepository.findByEntity(fullEntityType, entityId);

    const userIds = Array.from(
      new Set(
        tuples
          .filter((tuple) => tuple.subjectType === "user")
          .map((tuple) => tuple.subjectId)
      )
    );

    const users = userIds.length > 0 ? await userRepository.findByIds(userIds) : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    const grants: EntityGrantRecord[] = tuples.map((tuple) => ({
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

    return NextResponse.json({ grants });
  } catch (error) {
    console.error("[internal-client-grants:get] Error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> }
): Promise<NextResponse> {
  try {
    const _headers = await headers();
    const { clientId } = await context.params;

    if (!clientId) {
      return NextResponse.json(
        { error: "missing_fields", message: "clientId is required" },
        { status: 400 }
      );
    }

    const authResult = await authenticateClientApiKey(_headers, clientId);
    if ("error" in authResult) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    let body: CreateGrantRequest;
    try {
      const parsedBody = await request.json();
      if (!isRecord(parsedBody)) {
        return NextResponse.json(
          { error: "invalid_request", message: "Invalid JSON in request body" },
          { status: 400 }
        );
      }

      body = parsedBody as CreateGrantRequest;
    } catch {
      return NextResponse.json(
        { error: "invalid_request", message: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const entityTypeName = getNonEmptyString(body.entityTypeName);
    const entityId = getNonEmptyString(body.entityId);
    const relation = getNonEmptyString(body.relation);

    if (!entityTypeName || !entityId || !relation) {
      return NextResponse.json(
        {
          error: "missing_fields",
          message: "entityTypeName, entityId, and relation are required",
        },
        { status: 400 }
      );
    }

    if (body.subjectType !== "user" && body.subjectType !== "group") {
      return NextResponse.json(
        {
          error: "invalid_fields",
          message: "subjectType must be either 'user' or 'group'",
        },
        { status: 400 }
      );
    }

    const fullEntityType = `client_${clientId}:${entityTypeName}`;
    const model = await authorizationModelRepository.findByEntityType(fullEntityType);

    if (!model) {
      return NextResponse.json(
        {
          error: "unknown_entity_type",
          message: `Entity type '${entityTypeName}' not found in authorization model`,
        },
        { status: 404 }
      );
    }

    const validRelations = new Set(Object.keys(model.definition.relations));
    if (!validRelations.has(relation)) {
      return NextResponse.json(
        {
          error: "unknown_relation",
          message: `Relation '${relation}' is not defined for entity type '${entityTypeName}'`,
        },
        { status: 400 }
      );
    }

    let subjectId: string;

    if (body.subjectType === "user") {
      const subjectEmail = getNonEmptyString(body.subjectEmail)?.toLowerCase();
      if (!subjectEmail) {
        return NextResponse.json(
          {
            error: "missing_fields",
            message: "subjectEmail is required when subjectType is 'user'",
          },
          { status: 400 }
        );
      }

      const user = await userRepository.findByEmail(subjectEmail);
      if (!user) {
        return NextResponse.json(
          {
            error: "subject_not_found",
            message: `No user found for email '${subjectEmail}'`,
          },
          { status: 404 }
        );
      }

      subjectId = user.id;
    } else {
      const groupId = getNonEmptyString(body.subjectId);
      if (!groupId) {
        return NextResponse.json(
          {
            error: "missing_fields",
            message: "subjectId is required when subjectType is 'group'",
          },
          { status: 400 }
        );
      }

      const group = await userGroupRepository.findById(groupId);
      if (!group) {
        return NextResponse.json(
          {
            error: "subject_not_found",
            message: `Group '${groupId}' was not found`,
          },
          { status: 404 }
        );
      }

      subjectId = group.id;
    }

    await tupleRepository.createIfNotExists({
      entityType: fullEntityType,
      entityTypeId: model.id,
      entityId,
      relation,
      subjectType: body.subjectType,
      subjectId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[internal-client-grants:post] Error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
