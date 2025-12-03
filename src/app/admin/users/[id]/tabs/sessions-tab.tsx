"use client";

import * as React from "react";
import { Button, Modal } from "@/components/ui";
import { revokeUserSession, type UserDetail } from "../actions";
import { toast } from "@/lib/toast";
import { SessionList, type SessionItem } from "@/components/admin/users";

interface UserSessionsTabProps {
  user: UserDetail;
}

export function UserSessionsTab({ user }: UserSessionsTabProps) {
  const [sessionToRevoke, setSessionToRevoke] = React.useState<SessionItem | null>(null);

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

        <SessionList
          sessions={user.sessions}
          onRevoke={setSessionToRevoke}
        />
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
            <Button
              variant="danger"
              size="sm"
              onClick={() => sessionToRevoke?.token && handleRevokeSession(sessionToRevoke.token)}
            >
              Revoke Session
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
