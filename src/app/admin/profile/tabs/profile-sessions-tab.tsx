"use client";

import * as React from "react";
import { Card, CardContent, Button, Badge, Modal } from "@/components/ui";
import { revokeSession, revokeAllOtherSessions } from "../actions";
import type { SessionInfo } from "@/lib/session";
import { formatDate } from "@/lib/utils/date-formatter";
import { toast } from "@/lib/toast";

interface ProfileSessionsTabProps {
  sessions: SessionInfo[];
  currentSessionId: string;
}

export function ProfileSessionsTab({ sessions, currentSessionId }: ProfileSessionsTabProps) {
  const [sessionToRevoke, setSessionToRevoke] = React.useState<string | null>(null);
  const [showRevokeAllModal, setShowRevokeAllModal] = React.useState(false);

  const handleRevokeSession = async (sessionToken: string) => {
    const result = await revokeSession(sessionToken);
    setSessionToRevoke(null);
    
    if (result.success) {
      toast.success("Session revoked", "The user has been logged out from that device.");
    } else {
      toast.error("Failed to revoke session", result.error);
    }
  };

  const handleRevokeAllSessions = async () => {
    const result = await revokeAllOtherSessions();
    setShowRevokeAllModal(false);
    
    if (result.success) {
      toast.success("All sessions revoked", "You've been logged out from all other devices.");
    } else {
      toast.error("Failed to revoke sessions", result.error);
    }
  };

  return (
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
            <Card key={session.id} className={isCurrent ? "border-primary" : ""}>
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
    </div>
  );
}
