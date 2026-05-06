import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authenticateAuthorizationSpaceApiKey } from "@/lib/auth/space-api-key-auth";
import {
  authorizationModelRepository,
  tupleRepository,
  userGroupRepository,
  userRepository,
} from "@/lib/repositories";

type CreateGrantRequest = {
  modelId?: string;
  entityTypeName?: string;
  entityId: string;
  relation: string;
  subjectType: "user" | "group";
  subjectEmail?: string;
  subjectId?: string;
};

const DEFAULT_GRANTS_PAGE_LIMIT = 100;
const MAX_GRANTS_PAGE_LIMIT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseLimit(rawLimit: string | null): number | null {
  if (rawLimit === null) return null;
  const parsedLimit = /^\d+$/.test(rawLimit) ? Number.parseInt(rawLimit, 10) : Number.NaN;
  return Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : Number.NaN;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ spaceId: string }> }
): Promise<NextResponse> {
  const requestHeaders = await headers();
  const { spaceId } = await context.params;
  const authResult = await authenticateAuthorizationSpaceApiKey(requestHeaders, spaceId);
  if ("error" in authResult) {
    return NextResponse.json(authResult.error.body, { status: authResult.error.status });
  }

  const entityTypeName = getNonEmptyString(request.nextUrl.searchParams.get("entityTypeName"));
  const entityId = getNonEmptyString(request.nextUrl.searchParams.get("entityId"));
  const cursor = getNonEmptyString(request.nextUrl.searchParams.get("cursor")) ?? undefined;
  const parsedLimit = parseLimit(request.nextUrl.searchParams.get("limit"));

  if (parsedLimit !== null && Number.isNaN(parsedLimit)) {
    return NextResponse.json(
      { error: "invalid_limit", message: "limit must be a positive integer" },
      { status: 400 }
    );
  }

  if ((entityTypeName && !entityId) || (!entityTypeName && entityId)) {
    return NextResponse.json(
      { error: "missing_fields", message: "entityTypeName and entityId must both be provided when filtering" },
      { status: 400 }
    );
  }

  const model = entityTypeName
    ? await authorizationModelRepository.findBySpaceAndEntityTypeName(spaceId, entityTypeName)
    : null;
  if (entityTypeName && !model) {
    return NextResponse.json(
      { error: "unknown_model", message: "Model was not found in this authorization space" },
      { status: 404 }
    );
  }

  const tuplePage = await tupleRepository.findByAuthorizationSpacePaginated({
    authorizationSpaceId: spaceId,
    entityType: model?.entityType,
    entityId: model ? entityId ?? undefined : undefined,
    cursor,
    limit: Math.min(parsedLimit ?? DEFAULT_GRANTS_PAGE_LIMIT, MAX_GRANTS_PAGE_LIMIT),
  });

  const userIds = Array.from(
    new Set(tuplePage.tuples.filter((tuple) => tuple.subjectType === "user").map((tuple) => tuple.subjectId))
  );
  const users = userIds.length > 0 ? await userRepository.findByIds(userIds) : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  return NextResponse.json({
    grants: tuplePage.tuples.map((tuple) => ({
      tupleId: tuple.id,
      modelId: tuple.entityTypeId,
      entityType: tuple.entityType,
      entityId: tuple.entityId,
      relation: tuple.relation,
      subjectType: tuple.subjectType,
      subjectId: tuple.subjectId,
      userId: tuple.subjectType === "user" ? tuple.subjectId : null,
      userEmail: tuple.subjectType === "user" ? usersById.get(tuple.subjectId)?.email ?? null : null,
    })),
    nextCursor: tuplePage.nextCursor,
    hasMore: tuplePage.hasMore,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ spaceId: string }> }
): Promise<NextResponse> {
  const requestHeaders = await headers();
  const { spaceId } = await context.params;
  const authResult = await authenticateAuthorizationSpaceApiKey(requestHeaders, spaceId);
  if ("error" in authResult) {
    return NextResponse.json(authResult.error.body, { status: authResult.error.status });
  }

  let body: CreateGrantRequest;
  try {
    const parsedBody = await request.json();
    if (!isRecord(parsedBody)) {
      return NextResponse.json({ error: "invalid_request", message: "Invalid JSON in request body" }, { status: 400 });
    }
    body = parsedBody as CreateGrantRequest;
  } catch {
    return NextResponse.json({ error: "invalid_request", message: "Invalid JSON in request body" }, { status: 400 });
  }

  const entityId = getNonEmptyString(body.entityId);
  const relation = getNonEmptyString(body.relation);
  if (!entityId || !relation) {
    return NextResponse.json(
      { error: "missing_fields", message: "entityId and relation are required" },
      { status: 400 }
    );
  }

  if (body.subjectType !== "user" && body.subjectType !== "group") {
    return NextResponse.json(
      { error: "invalid_fields", message: "subjectType must be either 'user' or 'group'" },
      { status: 400 }
    );
  }

  const model = body.modelId
    ? await authorizationModelRepository.findById(body.modelId)
    : body.entityTypeName
      ? await authorizationModelRepository.findBySpaceAndEntityTypeName(spaceId, body.entityTypeName)
      : null;
  if (!model || model.authorizationSpaceId !== spaceId) {
    return NextResponse.json(
      { error: "unknown_model", message: "Model was not found in this authorization space" },
      { status: 404 }
    );
  }

  if (!Object.keys(model.definition.relations ?? {}).includes(relation)) {
    return NextResponse.json(
      { error: "unknown_relation", message: `Relation '${relation}' is not defined for this model` },
      { status: 400 }
    );
  }

  let subjectId: string;
  if (body.subjectType === "user") {
    const subjectEmail = getNonEmptyString(body.subjectEmail)?.toLowerCase();
    if (!subjectEmail) {
      return NextResponse.json(
        { error: "missing_fields", message: "subjectEmail is required when subjectType is user" },
        { status: 400 }
      );
    }
    const user = await userRepository.findByEmail(subjectEmail);
    if (!user) {
      return NextResponse.json(
        { error: "subject_not_found", message: `No user found for email '${subjectEmail}'` },
        { status: 404 }
      );
    }
    subjectId = user.id;
  } else {
    const groupId = getNonEmptyString(body.subjectId);
    if (!groupId) {
      return NextResponse.json(
        { error: "missing_fields", message: "subjectId is required when subjectType is group" },
        { status: 400 }
      );
    }
    const group = await userGroupRepository.findById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: "subject_not_found", message: `Group '${groupId}' was not found` },
        { status: 404 }
      );
    }
    subjectId = group.id;
  }

  await tupleRepository.createIfNotExists({
    entityType: model.entityType,
    entityTypeId: model.id,
    entityId,
    relation,
    subjectType: body.subjectType,
    subjectId,
    authorizationSpaceId: spaceId,
  });

  return NextResponse.json({ ok: true });
}
