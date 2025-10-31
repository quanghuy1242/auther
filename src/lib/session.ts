"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  username: string | null;
  displayUsername: string | null;
  role?: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  user: SessionUser;
  session: SessionInfo;
}

/**
 * Get the current user session on the server
 * Returns null if not authenticated
 */
export async function getSession(): Promise<Session | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    return session as Session | null;
  } catch (error) {
    console.error("Failed to get session:", error);
    return null;
  }
}

/**
 * Require authentication - throws redirect if not logged in
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  
  if (!session) {
    throw new Error("Unauthorized - please sign in");
  }

  return session;
}

/**
 * Require admin role - throws error if not admin
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireAuth();
  
  if (session?.user?.role !== "admin") {
    throw new Error("Forbidden - admin access required");
  }

  return session;
}
