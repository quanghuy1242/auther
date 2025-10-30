"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Sign out the current user
 * This server action properly handles session termination
 */
export async function signOut() {
  await auth.api.signOut({
    headers: await headers(),
  });
  
  redirect("/sign-in");
}
