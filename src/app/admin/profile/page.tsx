import * as React from "react";
import { requireAuth } from "@/lib/session";
import { getUserSessions } from "./actions";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage() {
  const { user, session } = await requireAuth();
  // Pass userId to avoid double auth check (performance optimization)
  const sessions = await getUserSessions(user.id);

  return <ProfileClient user={user} sessions={sessions} currentSessionId={session.id} />;
}
