import type { NextRequest } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth, trustedOrigins } from "@/lib/auth";
import { DEFAULT_CORS_HEADERS, DEFAULT_CORS_METHODS } from "@/lib/constants";
import {
  applyCorsHeaders,
  createCorsContext,
  handleCorsPreflightRequest,
  resolveAllowedOrigin
} from "@/lib/utils/cors";
import { isRegisteredOAuthClientOrigin } from "@/lib/utils/oauth-client";
import { metricsService } from "@/lib/services";
import { mintPayloadResourceAccessToken } from "@/lib/auth/resource-access-token";

const baseHandler = toNextJsHandler(auth.handler);

const corsContext = createCorsContext({
  allowedOrigins: trustedOrigins,
  allowedMethods: DEFAULT_CORS_METHODS,
  allowedHeaders: DEFAULT_CORS_HEADERS,
  allowCredentials: true,
  maxAge: 86400,
});

// Extract OIDC route type from path
function getOidcRouteType(pathname: string): string | null {
  if (pathname.includes("/authorize")) return "authorize";
  if (pathname.includes("/token")) return "token";
  if (pathname.includes("/userinfo")) return "userinfo";
  if (pathname.includes("/jwks")) return "jwks";
  if (pathname.includes("/sign-in")) return "sign_in";
  if (pathname.includes("/sign-up")) return "sign_up";
  if (pathname.includes("/sign-out")) return "sign_out";
  return null;
}

async function wrapWithMetrics(
  request: NextRequest,
  handler: () => Promise<Response>
): Promise<Response> {
  const start = performance.now();
  const pathname = new URL(request.url).pathname;
  const oidcRoute = getOidcRouteType(pathname);

  const response = await handler();
  const duration = performance.now() - start;
  const statusClass = `${Math.floor(response.status / 100)}xx`;

  // Emit OIDC-specific metrics
  if (oidcRoute) {
    void metricsService.count(`oidc.${oidcRoute}.request.count`, 1, {
      result: response.ok ? "success" : "error"
    });
    void metricsService.histogram(`oidc.${oidcRoute}.latency_ms`, duration, {
      result: response.ok ? "success" : "error"
    });
  }

  // General auth endpoint metrics
  void metricsService.histogram("auth.request.duration_ms", duration, {
    path: oidcRoute || "other",
    status_class: statusClass,
  });

  return response;
}

async function withResourceAccessTokenResponse(
  request: NextRequest,
  response: Response
): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  if (!pathname.includes("/oauth2/token") || !response.ok) {
    return response;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response;
  }

  const tokenBody = (await response.clone().json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
    [key: string]: unknown;
  } | null;

  if (typeof tokenBody?.access_token !== "string" || tokenBody.access_token.trim().length === 0) {
    return response;
  }

  const resourceToken = await mintPayloadResourceAccessToken(tokenBody.access_token);

  if (!resourceToken) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(
    JSON.stringify({
      ...tokenBody,
      access_token: resourceToken.accessToken,
      expires_in: resourceToken.expiresIn,
      resource: resourceToken.audience,
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    }
  );
}

function setCorsHeaders(response: Response, origin: string): Response {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", DEFAULT_CORS_METHODS.join(","));
  response.headers.set("Access-Control-Allow-Headers", DEFAULT_CORS_HEADERS.join(", "));
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Vary", "Origin");
  return response;
}

async function applyAuthCorsHeaders(request: NextRequest, response: Response): Promise<Response> {
  const staticOrigin = resolveAllowedOrigin(request, corsContext);
  if (staticOrigin) {
    return applyCorsHeaders(request, response, corsContext);
  }

  const origin = request.headers.get("origin");
  if (await isRegisteredOAuthClientOrigin(origin)) {
    return setCorsHeaders(response, origin!);
  }

  return response;
}

async function handleAuthCorsPreflightRequest(request: NextRequest): Promise<Response> {
  const staticOrigin = resolveAllowedOrigin(request, corsContext);
  if (staticOrigin) {
    return handleCorsPreflightRequest(request, corsContext);
  }

  const origin = request.headers.get("origin");
  if (!(await isRegisteredOAuthClientOrigin(origin))) {
    return new Response(null, { status: 403 });
  }

  const response = new Response(null, { status: 204 });
  const allowedMethods = request.headers.get("access-control-request-method") ?? DEFAULT_CORS_METHODS.join(",");
  const allowedHeaders = request.headers.get("access-control-request-headers") ?? DEFAULT_CORS_HEADERS.join(", ");

  response.headers.set("Access-Control-Allow-Origin", origin!);
  response.headers.set("Access-Control-Allow-Methods", allowedMethods);
  response.headers.set("Access-Control-Allow-Headers", allowedHeaders);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin");

  return response;
}

export async function GET(request: NextRequest) {
  const response = await wrapWithMetrics(request, () => baseHandler.GET(request));
  return applyAuthCorsHeaders(request, response);
}

export async function POST(request: NextRequest) {
  const response = await wrapWithMetrics(request, async () => {
    const baseResponse = await baseHandler.POST(request);
    return withResourceAccessTokenResponse(request, baseResponse);
  });
  return applyAuthCorsHeaders(request, response);
}

export async function OPTIONS(request: NextRequest) {
  return handleAuthCorsPreflightRequest(request);
}
