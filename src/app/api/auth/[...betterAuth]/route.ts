import type { NextRequest } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth, trustedOrigins } from "@/lib/auth";
import { DEFAULT_CORS_HEADERS, DEFAULT_CORS_METHODS } from "@/lib/constants";
import {
  applyCorsHeaders,
  createCorsContext,
  handleCorsPreflightRequest
} from "@/lib/utils/cors";
import { metricsService } from "@/lib/services";

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

export async function GET(request: NextRequest) {
  const response = await wrapWithMetrics(request, () => baseHandler.GET(request));
  return applyCorsHeaders(request, response, corsContext);
}

export async function POST(request: NextRequest) {
  const response = await wrapWithMetrics(request, () => baseHandler.POST(request));
  return applyCorsHeaders(request, response, corsContext);
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request, corsContext);
}
