import * as React from "react";
import { Card, CardContent, Button, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils/date-formatter";

export interface SessionItem {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  token?: string; // Optional, depending on whether we have the token to revoke
}

interface SessionListProps {
  sessions: SessionItem[];
  currentSessionId?: string;
  onRevoke: (session: SessionItem) => void;
}

export function SessionList({ sessions, currentSessionId, onRevoke }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">No active sessions found</p>
      </div>
    );
  }

  return (
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
                    onClick={() => onRevoke(session)}
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
  );
}
