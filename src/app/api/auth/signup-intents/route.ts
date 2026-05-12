import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { oauthApplication } from "@/db/schema";
import { env } from "@/env";
import { authenticateAuthorizationSpaceApiKey } from "@/lib/auth/space-api-key-auth";
import { db } from "@/lib/db";
import {
  authorizationSpaceRepository,
  oauthClientSpaceLinkRepository,
} from "@/lib/repositories";
import { registrationContextService } from "@/lib/services/registration-context-service";

type TriggerKind = "oauth_client" | "resource_server";

type SignupIntentRequest = {
  flow?: string;
  authorizationSpaceId?: string;
  trigger?: {
    kind?: TriggerKind;
    id?: string;
  };
  requestedGrants?: Array<{ entityTypeId: string; relation: string; entityId?: string }>;
  returnUrl?: string;
  expiresInSeconds?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function constantTimeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function readBasicCredentials(request: NextRequest): { clientId: string; clientSecret: string } | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) {
      return null;
    }
    return {
      clientId: decoded.slice(0, separator),
      clientSecret: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

async function authenticateOAuthClientTrigger(
  request: NextRequest,
  triggerId: string,
  authorizationSpaceId: string
): Promise<NextResponse | null> {
  const credentials = readBasicCredentials(request);
  if (!credentials || credentials.clientId !== triggerId) {
    return NextResponse.json(
      { error: "unauthorized", message: "OAuth client credentials are required" },
      { status: 401 }
    );
  }

  const [client] = await db
    .select({
      clientId: oauthApplication.clientId,
      clientSecret: oauthApplication.clientSecret,
      disabled: oauthApplication.disabled,
    })
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, triggerId))
    .limit(1);

  if (!client || client.disabled || !client.clientSecret) {
    return NextResponse.json(
      { error: "unauthorized", message: "OAuth client is not active" },
      { status: 401 }
    );
  }

  if (!constantTimeEquals(credentials.clientSecret, client.clientSecret)) {
    return NextResponse.json(
      { error: "unauthorized", message: "OAuth client credentials are invalid" },
      { status: 401 }
    );
  }

  const link = await oauthClientSpaceLinkRepository.findByClientAndSpace(
    triggerId,
    authorizationSpaceId
  );
  if (!link || (link.accessMode !== "can_trigger_contexts" && link.accessMode !== "full")) {
    return NextResponse.json(
      { error: "forbidden", message: "OAuth client cannot trigger onboarding for this authorization space" },
      { status: 403 }
    );
  }

  return null;
}

async function authenticateResourceServerTrigger(
  triggerId: string,
  authorizationSpaceId: string
): Promise<NextResponse | null> {
  const space = await authorizationSpaceRepository.findById(authorizationSpaceId);
  if (!space || space.resourceServerId !== triggerId) {
    return NextResponse.json(
      { error: "forbidden", message: "Resource server does not own this authorization space" },
      { status: 403 }
    );
  }

  const authResult = await authenticateAuthorizationSpaceApiKey(await headers(), authorizationSpaceId);
  if ("error" in authResult) {
    return NextResponse.json(authResult.error.body, { status: authResult.error.status });
  }

  return null;
}

function parseRequestBody(body: unknown): SignupIntentRequest | null {
  if (!isRecord(body)) {
    return null;
  }

  return body as SignupIntentRequest;
}

function parseRequestedGrants(value: unknown): SignupIntentRequest["requestedGrants"] | null {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const grants = value.map((grant) => {
    if (!isRecord(grant)) {
      return null;
    }
    const entityTypeId = typeof grant.entityTypeId === "string" ? grant.entityTypeId.trim() : "";
    const relation = typeof grant.relation === "string" ? grant.relation.trim() : "";
    const entityId = typeof grant.entityId === "string" ? grant.entityId.trim() : undefined;
    if (!entityTypeId || !relation) {
      return null;
    }
    return { entityTypeId, relation, entityId: entityId || undefined };
  });

  return grants.every(Boolean)
    ? grants as NonNullable<SignupIntentRequest["requestedGrants"]>
    : null;
}

function parseExpiresInSeconds(value: unknown): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: SignupIntentRequest | null;
  try {
    body = parseRequestBody(await request.json());
  } catch {
    body = null;
  }

  if (!body?.flow || !body.authorizationSpaceId || !body.returnUrl || !body.trigger?.kind || !body.trigger.id) {
    return NextResponse.json(
      { error: "invalid_request", message: "flow, authorizationSpaceId, trigger, and returnUrl are required" },
      { status: 400 }
    );
  }

  if (body.trigger.kind !== "oauth_client" && body.trigger.kind !== "resource_server") {
    return NextResponse.json(
      { error: "invalid_request", message: "trigger.kind must be oauth_client or resource_server" },
      { status: 400 }
    );
  }

  const requestedGrants = parseRequestedGrants(body.requestedGrants);
  if (requestedGrants === null) {
    return NextResponse.json(
      { error: "invalid_request", message: "requestedGrants must be an array of entityTypeId/relation grants" },
      { status: 400 }
    );
  }

  const expiresInSeconds = parseExpiresInSeconds(body.expiresInSeconds);
  if (expiresInSeconds === null) {
    return NextResponse.json(
      { error: "invalid_request", message: "expiresInSeconds must be a finite number" },
      { status: 400 }
    );
  }

  const authError = body.trigger.kind === "oauth_client"
    ? await authenticateOAuthClientTrigger(request, body.trigger.id, body.authorizationSpaceId)
    : await authenticateResourceServerTrigger(body.trigger.id, body.authorizationSpaceId);
  if (authError) {
    return authError;
  }

  const policyCheck = await registrationContextService.validateSignupIntentPolicy({
    kind: "signup_intent",
    flow: body.flow,
    trigger: {
      kind: body.trigger.kind,
      id: body.trigger.id,
    },
    authorizationSpaceId: body.authorizationSpaceId,
    requestedGrants,
    returnUrl: body.returnUrl,
    nonce: "preflight",
    exp: Date.now() + 60_000,
  });

  if (!policyCheck.valid) {
    return NextResponse.json(
      { error: "forbidden", message: policyCheck.error ?? "Signup intent is not allowed" },
      { status: 403 }
    );
  }

  let intent: Awaited<ReturnType<typeof registrationContextService.createSignedSignupIntent>>;
  try {
    intent = await registrationContextService.createSignedSignupIntent({
      flow: body.flow,
      trigger: {
        kind: body.trigger.kind,
        id: body.trigger.id,
      },
      authorizationSpaceId: body.authorizationSpaceId,
      requestedGrants,
      returnUrl: body.returnUrl,
      expiresInSeconds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: error instanceof Error ? error.message : "Signup intent is not allowed",
      },
      { status: 403 }
    );
  }

  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? env.PRODUCTION_URL ?? "http://localhost:3000";
  const signupUrl = new URL("/sign-up", baseUrl);
  signupUrl.searchParams.set("intent", intent.token);

  const theme = policyCheck.context?.theme?.trim();
  if (theme) {
    signupUrl.searchParams.set("theme", theme);
  }

  return NextResponse.json({
    token: intent.token,
    signupUrl: signupUrl.toString(),
    nonce: intent.nonce,
    expiresAt: intent.expiresAt.toISOString(),
  });
}
