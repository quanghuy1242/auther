"use client";

import * as React from "react";
import { Button, Modal } from "@/components/ui";
import { revokeSession, revokeAllOtherSessions } from "../actions";
import type { SessionInfo } from "@/lib/session";
import { toast } from "@/lib/toast";
import { SessionList, type SessionItem } from "@/components/admin/users";

interface ProfileSessionsTabProps {
  sessions: SessionInfo[];
  currentSessionId: string;
}

export function ProfileSessionsTab({ sessions, currentSessionId }: ProfileSessionsTabProps) {
  const [sessionToRevoke, setSessionToRevoke] = React.useState<SessionItem | null>(null);
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

      <SessionList
        sessions={sessions}
        currentSessionId={currentSessionId}
        onRevoke={setSessionToRevoke}
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
            onClick={() => sessionToRevoke?.token && handleRevokeSession(sessionToRevoke.token)}
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
