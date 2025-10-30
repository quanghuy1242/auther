import type { NextRequest } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth, trustedOrigins } from "@/lib/auth";
import { DEFAULT_CORS_HEADERS, DEFAULT_CORS_METHODS } from "@/lib/constants";
import { 
  applyCorsHeaders, 
  createCorsContext, 
  handleCorsPreflightRequest 
} from "@/lib/utils/cors";

const baseHandler = toNextJsHandler(auth.handler);

const corsContext = createCorsContext({
  allowedOrigins: trustedOrigins,
  allowedMethods: DEFAULT_CORS_METHODS,
  allowedHeaders: DEFAULT_CORS_HEADERS,
  allowCredentials: true,
  maxAge: 86400,
});

export async function GET(request: NextRequest) {
  const response = await baseHandler.GET(request);
  return applyCorsHeaders(request, response, corsContext);
}

export async function POST(request: NextRequest) {
  const response = await baseHandler.POST(request);
  return applyCorsHeaders(request, response, corsContext);
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request, corsContext);
}
