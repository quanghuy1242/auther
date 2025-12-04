import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const AUTH_ROUTES = ["/admin", "/dashboard"];
const PUBLIC_AUTH_PAGES = ["/sign-in"];

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isProtected = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // Redirect to sign-in if accessing protected route without session
  if (!sessionCookie && isProtected) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Note: We intentionally don't redirect from /sign-in to /admin when session exists
  // This prevents infinite loops when the session cookie exists but is invalid/expired
  // The sign-in action and admin layout will handle proper session validation

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/sign-in"],
};

