"use client";

import * as React from "react";
import Image from "next/image";
import { Badge, Tabs, Card, CardContent } from "@/components/ui";
import type { SessionUser, SessionInfo } from "@/lib/session";
import { getUserInitials } from "@/lib/session-utils";

import { ProfileDetailsTab } from "./tabs/profile-details-tab";
import { ProfileSessionsTab } from "./tabs/profile-sessions-tab";

interface ProfileClientProps {
  user: SessionUser;
  sessions: SessionInfo[];
  currentSessionId: string;
}

export function ProfileClient({ user, sessions, currentSessionId }: ProfileClientProps) {
  return (
    <>
      {/* Page Heading */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div className="flex items-center gap-4">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white text-2xl font-bold">{getUserInitials(user)}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-4xl font-black text-white tracking-tight">{user.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant={user.emailVerified ? "success" : "warning"} dot>
                {user.emailVerified ? "Verified" : "Unverified"}
              </Badge>
              <p className="text-base text-gray-400">{user.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          {
            label: "Profile",
            content: <ProfileDetailsTab user={user} />,
          },
          {
            label: "Sessions",
            content: <ProfileSessionsTab sessions={sessions} currentSessionId={currentSessionId} />,
          },
          {
            label: "Activity",
            content: (
              <div className="pt-6">
                <Card>
                  <CardContent>
                    <p className="text-center py-12 text-gray-400">
                      Activity log coming soon...
                    </p>
                  </CardContent>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}