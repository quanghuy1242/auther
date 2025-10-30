import type { NextRequest } from "next/server";

import { createWildcardRegexes, partitionWildcardPatterns } from "./wildcard";

export type CorsConfig = {
  allowedOrigins: string[];
  allowedMethods: readonly string[];
  allowedHeaders: readonly string[];
  allowCredentials?: boolean;
  maxAge?: number;
};

export type CorsContext = {
  exactOrigins: Set<string>;
  wildcardMatchers: RegExp[];
  config: CorsConfig;
};

/**
 * Creates a CORS context for efficient origin matching
 */
export function createCorsContext(config: CorsConfig): CorsContext {
  const { exact, wildcard } = partitionWildcardPatterns(config.allowedOrigins);
  
  return {
    exactOrigins: new Set(exact),
    wildcardMatchers: createWildcardRegexes(wildcard),
    config,
  };
}

/**
 * Resolves the allowed origin from request headers
 */
export function resolveAllowedOrigin(
  request: NextRequest,
  context: CorsContext
): string | undefined {
  const origin = request.headers.get("origin");
  
  if (!origin) {
    return undefined;
  }
  
  if (context.exactOrigins.has(origin)) {
    return origin;
  }
  
  if (context.wildcardMatchers.some((regex) => regex.test(origin))) {
    return origin;
  }
  
  return undefined;
}

/**
 * Applies CORS headers to a response
 */
export function applyCorsHeaders(
  request: NextRequest,
  response: Response,
  context: CorsContext
): Response {
  const origin = resolveAllowedOrigin(request, context);
  
  if (!origin) {
    return response;
  }
  
  const allowedMethods = context.config.allowedMethods.join(",");
  const allowedHeaders = context.config.allowedHeaders.join(", ");
  
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", allowedMethods);
  response.headers.set("Access-Control-Allow-Headers", allowedHeaders);
  response.headers.set("Vary", "Origin");
  
  if (context.config.allowCredentials) {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  
  return response;
}

/**
 * Handles CORS preflight request
 */
export function handleCorsPreflightRequest(
  request: NextRequest,
  context: CorsContext
): Response {
  const origin = resolveAllowedOrigin(request, context);
  
  if (!origin) {
    return new Response(null, { status: 403 });
  }
  
  const allowedMethods = 
    request.headers.get("access-control-request-method") ?? 
    context.config.allowedMethods.join(",");
  
  const allowedHeaders = 
    request.headers.get("access-control-request-headers") ?? 
    context.config.allowedHeaders.join(", ");
  
  const response = new Response(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", allowedMethods);
  response.headers.set("Access-Control-Allow-Headers", allowedHeaders);
  response.headers.set("Vary", "Origin");
  
  if (context.config.allowCredentials) {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  
  if (context.config.maxAge) {
    response.headers.set("Access-Control-Max-Age", context.config.maxAge.toString());
  }
  
  return response;
}
