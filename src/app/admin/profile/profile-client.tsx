"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Label, Tabs, Modal } from "@/components/ui";
import { updateProfile, revokeSession, revokeAllOtherSessions, type UpdateProfileState } from "./actions";
import type { SessionUser, SessionInfo } from "@/lib/session";
import { getUserInitials } from "@/lib/session-utils";
import { formatDate, formatDateShort } from "@/lib/utils/date-formatter";

interface ProfileClientProps {
  user: SessionUser;
  sessions: SessionInfo[];
  currentSessionId: string;
}

export function ProfileClient({ user, sessions, currentSessionId }: ProfileClientProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [sessionToRevoke, setSessionToRevoke] = React.useState<string | null>(null);
  const [showRevokeAllModal, setShowRevokeAllModal] = React.useState(false);
  
  const [profileState, profileAction] = useFormState<UpdateProfileState, FormData>(
    updateProfile,
    { success: false }
  );

  React.useEffect(() => {
    if (profileState.success) {
      setIsEditing(false);
    }
  }, [profileState.success]);

  const handleRevokeSession = async (sessionToken: string) => {
    await revokeSession(sessionToken);
    setSessionToRevoke(null);
  };

  const handleRevokeAllSessions = async () => {
    await revokeAllOtherSessions();
    setShowRevokeAllModal(false);
  };

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
            <div className="w-16 h-16 rounded-full bg-[#1773cf] flex items-center justify-center">
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
            content: (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6">
                <div className="md:col-span-2 space-y-8">
                  {/* User Details Card */}
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>User Details</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsEditing(!isEditing)}
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {isEditing ? (
                        <form action={profileAction} className="space-y-4">
                          <div>
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                              id="name"
                              name="name"
                              defaultValue={user.name}
                              error={profileState.errors?.name}
                            />
                          </div>
                          <div>
                            <Label htmlFor="username">Username</Label>
                            <Input
                              id="username"
                              name="username"
                              defaultValue={user.username || ""}
                              placeholder="Optional"
                              error={profileState.errors?.username}
                            />
                          </div>
                          <div>
                            <Label htmlFor="displayUsername">Display Username</Label>
                            <Input
                              id="displayUsername"
                              name="displayUsername"
                              defaultValue={user.displayUsername || ""}
                              placeholder="Optional"
                              error={profileState.errors?.displayUsername}
                            />
                          </div>
                          <div>
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                              id="email"
                              value={user.email}
                              disabled
                              className="opacity-50"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                              Email cannot be changed
                            </p>
                          </div>
                          {profileState.error && (
                            <p className="text-sm text-red-500">{profileState.error}</p>
                          )}
                          {profileState.success && (
                            <p className="text-sm text-green-500">Profile updated successfully!</p>
                          )}
                          <Button type="submit" variant="primary" size="sm">
                            Save Changes
                          </Button>
                        </form>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div>
                            <Label className="text-gray-400">Full Name</Label>
                            <p className="text-base text-white mt-1">{user.name}</p>
                          </div>
                          <div>
                            <Label className="text-gray-400">Email Address</Label>
                            <p className="text-base text-white mt-1">{user.email}</p>
                          </div>
                          <div>
                            <Label className="text-gray-400">Username</Label>
                            <p className="text-base text-white mt-1">{user.username || "Not set"}</p>
                          </div>
                          <div>
                            <Label className="text-gray-400">Display Username</Label>
                            <p className="text-base text-white mt-1">
                              {user.displayUsername || "Not set"}
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="md:col-span-1">
                  {/* System Info Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>System Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <Label className="text-gray-400">User ID</Label>
                          <p className="text-sm text-white mt-1 break-all font-mono">{user.id}</p>
                        </div>
                        <div>
                          <Label className="text-gray-400">Date Joined</Label>
                          <p className="text-base text-white mt-1">
                            {formatDateShort(user.createdAt)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-400">Last Updated</Label>
                          <p className="text-base text-white mt-1">
                            {formatDateShort(user.updatedAt)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-400">Email Status</Label>
                          <div className="mt-1">
                            <Badge variant={user.emailVerified ? "success" : "warning"}>
                              {user.emailVerified ? "Verified" : "Unverified"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            label: "Sessions",
            content: (
              <div className="pt-6 space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-white">Active Sessions</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      Manage your active sessions across devices
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowRevokeAllModal(true)}
                    disabled={sessions.length <= 1}
                  >
                    Revoke All Other Sessions
                  </Button>
                </div>

                <div className="space-y-4">
                  {sessions.map((session) => {
                    const isCurrent = session.id === currentSessionId;
                    const isExpired = new Date(session.expiresAt) < new Date();

                    return (
                      <Card key={session.id} variant={isCurrent ? "bordered" : "default"}>
                        <CardContent>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-base font-semibold text-white">
                                  {session.userAgent || "Unknown Device"}
                                </h3>
                                {isCurrent && (
                                  <Badge variant="success">Current Session</Badge>
                                )}
                                {isExpired && <Badge variant="danger">Expired</Badge>}
                              </div>
                              <div className="space-y-1 text-sm text-gray-400">
                                <p>IP Address: {session.ipAddress || "Unknown"}</p>
                                <p>Created: {formatDate(session.createdAt)}</p>
                                <p>Expires: {formatDate(session.expiresAt)}</p>
                              </div>
                            </div>
                            {!isCurrent && (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setSessionToRevoke(session.token)}
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {sessions.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-400">No active sessions found</p>
                  </div>
                )}
              </div>
            ),
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

      {/* Revoke Session Confirmation Modal */}
      <Modal
        isOpen={!!sessionToRevoke}
        onClose={() => setSessionToRevoke(null)}
        title="Revoke Session"
        description="Are you sure you want to revoke this session? The user will be logged out from that device."
      >
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="ghost" size="sm" onClick={() => setSessionToRevoke(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => sessionToRevoke && handleRevokeSession(sessionToRevoke)}
          >
            Revoke Session
          </Button>
        </div>
      </Modal>

      {/* Revoke All Sessions Confirmation Modal */}
      <Modal
        isOpen={showRevokeAllModal}
        onClose={() => setShowRevokeAllModal(false)}
        title="Revoke All Other Sessions"
        description="This will log you out from all other devices. Your current session will remain active."
      >
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="ghost" size="sm" onClick={() => setShowRevokeAllModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleRevokeAllSessions}>
            Revoke All Sessions
          </Button>
        </div>
      </Modal>
    </>
  );
}
