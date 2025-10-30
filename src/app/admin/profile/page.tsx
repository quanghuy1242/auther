import * as React from "react";
import { requireAuth } from "@/lib/session";
import { getUserSessions } from "./actions";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage() {
  const { user, session } = await requireAuth();
  // Get sessions using better-auth API (already authenticated)
  const sessions = await getUserSessions();

  return (
    <div className="max-w-6xl mx-auto">
      <ProfileClient user={user} sessions={sessions} currentSessionId={session.id} />
    </div>
  );
}
