import type { NextRequest } from "next/server";

import { toNextJsHandler } from "better-auth/next-js";

import { auth, trustedOrigins } from "@/lib/auth";

const baseHandler = toNextJsHandler(auth.handler);

const allowedOrigins = new Set(trustedOrigins);

function resolveAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return undefined;
  }
  if (allowedOrigins.has(origin)) {
    return origin;
  }
  return undefined;
}

function applyCorsHeaders(request: NextRequest, response: Response) {
  const origin = resolveAllowedOrigin(request);
  if (!origin) {
    return response;
  }

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-internal-signup-secret");
  response.headers.set("Vary", "Origin");

  return response;
}

export async function GET(request: NextRequest) {
  const response = await baseHandler.GET(request);
  return applyCorsHeaders(request, response);
}

export async function POST(request: NextRequest) {
  const response = await baseHandler.POST(request);
  return applyCorsHeaders(request, response);
}

export async function OPTIONS(request: NextRequest) {
  const origin = resolveAllowedOrigin(request);
  if (!origin) {
    return new Response(null, { status: 403 });
  }

  const response = new Response(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set(
    "Access-Control-Allow-Headers",
    request.headers.get("access-control-request-headers") ??
      "Content-Type, Authorization, x-internal-signup-secret",
  );
  response.headers.set(
    "Access-Control-Allow-Methods",
    request.headers.get("access-control-request-method") ?? "GET,POST,OPTIONS",
  );
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin");

  return response;
}
