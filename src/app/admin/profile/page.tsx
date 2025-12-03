import type { Metadata } from "next";
import * as React from "react";
import { requireAuth } from "@/lib/session";
import { getUserSessions } from "./actions";
import { ProfileClient } from "./profile-client";
import { PageContainer } from "@/components/layout";

export const metadata: Metadata = {
  title: "Profile Settings",
  description: "Manage your account profile and active sessions",
};

export default async function ProfilePage() {
  const { user, session } = await requireAuth();
  // Get sessions using better-auth API (already authenticated)
  const sessions = await getUserSessions();

  return (
    <PageContainer>
      <ProfileClient user={user} sessions={sessions} currentSessionId={session.id} />
    </PageContainer>
  );
}
