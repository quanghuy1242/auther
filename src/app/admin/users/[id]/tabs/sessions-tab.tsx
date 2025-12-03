"use client";

import * as React from "react";
import { Card, CardContent, Button, Modal, Badge } from "@/components/ui";
import { revokeUserSession, type UserDetail } from "../actions";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils/date-formatter";

interface UserSessionsTabProps {
  user: UserDetail;
}

export function UserSessionsTab({ user }: UserSessionsTabProps) {
  const [sessionToRevoke, setSessionToRevoke] = React.useState<string | null>(null);

  const handleRevokeSession = async (sessionToken: string) => {
    const result = await revokeUserSession(sessionToken, user.id);
    setSessionToRevoke(null);
    if (result?.success) {
      toast.success("Session revoked", "The user session has been revoked.");
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">Active Sessions</h2>
            <p className="text-sm text-gray-400 mt-1">
              Manage user&apos;s active sessions
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {user.sessions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No active sessions</p>
            </div>
          ) : (
            user.sessions.map((session) => {
              const isExpired = new Date(session.expiresAt) < new Date();

              return (
                <Card key={session.id}>
                  <CardContent>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-base font-semibold text-white">
                            {session.userAgent || "Unknown Device"}
                          </h3>
                          {isExpired && <Badge variant="danger">Expired</Badge>}
                        </div>
                        <div className="space-y-1 text-sm text-gray-400">
                          <p>IP Address: {session.ipAddress || "Unknown"}</p>
                          <p>Created: {formatDate(session.createdAt)}</p>
                          <p>Expires: {formatDate(session.expiresAt)}</p>
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setSessionToRevoke(session.token)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Revoke Session Modal */}
      {sessionToRevoke && (
        <Modal
          isOpen={!!sessionToRevoke}
          onClose={() => setSessionToRevoke(null)}
          title="Revoke Session"
        >
          <p className="text-gray-300 mb-6">
            Are you sure you want to revoke this session? The user will be logged out from
            this device.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setSessionToRevoke(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => handleRevokeSession(sessionToRevoke)}>
              Revoke Session
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
