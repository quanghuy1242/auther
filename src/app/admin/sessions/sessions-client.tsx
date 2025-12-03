"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Icon, Badge, Checkbox, Modal, SearchInput, ResponsiveTable, Pagination } from "@/components/ui";
import { revokeSession, revokeExpiredSessions } from "../actions";
import { formatTimeAgo } from "@/lib/utils/date-formatter";
import { parseUserAgent } from "@/lib/utils/user-agent";

interface Session {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
}

interface SessionsClientProps {
  initialSessions: Session[];
  initialTotal: number;
  initialPage: number;
  totalPages: number;
  initialSearch: string;
  initialActiveOnly: boolean;
}

export function SessionsClient({
  initialSessions,
  initialTotal,
  initialPage,
  totalPages,
  initialSearch,
  initialActiveOnly,
}: SessionsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeOnly, setActiveOnly] = React.useState(initialActiveOnly);
  const [revokeModalSession, setRevokeModalSession] = React.useState<Session | null>(null);
  const [isRevoking, setIsRevoking] = React.useState(false);
  const [isCleaningUp, setIsCleaningUp] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    params.delete("page"); // Reset to page 1 on search
    startTransition(() => {
      router.push(`/admin/sessions?${params.toString()}`);
    });
  };

  const handleFilterChange = (newActiveOnly: boolean) => {
    setActiveOnly(newActiveOnly);
    const params = new URLSearchParams(searchParams.toString());
    if (newActiveOnly) {
      params.set("activeOnly", "true");
    } else {
      params.delete("activeOnly");
    }
    params.delete("page");
    startTransition(() => {
      router.push(`/admin/sessions?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    startTransition(() => {
      router.push(`/admin/sessions?${params.toString()}`);
    });
  };

  const handleRevoke = async () => {
    if (!revokeModalSession) return;

    setIsRevoking(true);
    try {
      const result = await revokeSession(revokeModalSession.id);
      if (result.success) {
        setRevokeModalSession(null);
        router.refresh();
      } else {
        alert(result.error || "Failed to revoke session");
      }
    } finally {
      setIsRevoking(false);
    }
  };

  const handleCleanupExpired = async () => {
    if (!confirm("Are you sure you want to remove all expired sessions?")) {
      return;
    }

    setIsCleaningUp(true);
    try {
      const result = await revokeExpiredSessions();
      if (result.success) {
        alert(`Successfully removed ${result.count} expired sessions`);
        router.refresh();
      } else {
        alert(result.error || "Failed to cleanup expired sessions");
      }
    } finally {
      setIsCleaningUp(false);
    }
  };

  const isExpired = (expiresAt: Date) => new Date() > expiresAt;

  return (
    <>
      <div className="mb-6 p-0 rounded-lg border border-border-dark bg-card">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:max-w-md">
              <SearchInput
                placeholder="Search by email, name, or IP address..."
                defaultValue={initialSearch}
                onSearch={handleSearch}
              />
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <Checkbox
                checked={activeOnly}
                onChange={handleFilterChange}
                label="Active only"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCleanupExpired}
                leftIcon="delete_sweep"
                disabled={isCleaningUp}
                isLoading={isCleaningUp}
              >
                Cleanup Expired
              </Button>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-400">
            Showing {initialSessions.length} of {initialTotal} sessions
          </div>
        </div>
      </div>

      <div className="rounded-lg border-0 sm:border sm:border-border-dark overflow-hidden">
        <ResponsiveTable
          columns={[
            {
              key: "user",
              header: "User",
              render: (session) => (
                <div>
                  <p className="text-sm font-medium text-white">
                    {session.userName || "Unknown"}
                  </p>
                  <p className="text-xs text-gray-400">{session.userEmail}</p>
                </div>
              ),
            },
            {
              key: "device",
              header: "Device",
              render: (session) => (
                <div className="flex items-center gap-2">
                  <Icon name="devices" className="text-gray-400" />
                  <span className="text-sm text-gray-200">{parseUserAgent(session.userAgent)}</span>
                </div>
              ),
            },
            {
              key: "ip",
              header: "IP Address",
              render: (session) => (
                <code className="text-xs text-gray-400">
                  {session.ipAddress || "N/A"}
                </code>
              ),
            },
            {
              key: "created",
              header: "Created",
              render: (session) => (
                <span className="text-sm text-gray-400">
                  {formatTimeAgo(session.createdAt)}
                </span>
              ),
            },
            {
              key: "lastActive",
              header: "Last Active",
              render: (session) => (
                <span className="text-sm text-gray-400">
                  {formatTimeAgo(session.updatedAt)}
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (session) => (
                isExpired(session.expiresAt) ? (
                  <Badge variant="default">Expired</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )
              ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (session) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevokeModalSession(session)}
                  leftIcon="block"
                >
                  Revoke
                </Button>
              ),
            },
          ]}
          data={initialSessions}
          keyExtractor={(session) => session.id}
          mobileCardRender={(session) => (
            <div className="p-4 border border-border-dark rounded-lg bg-card space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-white">
                    {session.userName || "Unknown"}
                  </p>
                  <p className="text-xs text-gray-400">{session.userEmail}</p>
                </div>
                {isExpired(session.expiresAt) ? (
                  <Badge variant="default">Expired</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-400">Device:</div>
                <div className="text-white text-right">{parseUserAgent(session.userAgent)}</div>
                
                <div className="text-gray-400">IP:</div>
                <div className="text-white text-right">{session.ipAddress || "N/A"}</div>
                
                <div className="text-gray-400">Active:</div>
                <div className="text-white text-right">{formatTimeAgo(session.updatedAt)}</div>
              </div>

              <div className="pt-2 border-t border-border-dark">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-red-400 hover:text-red-300"
                  onClick={() => setRevokeModalSession(session)}
                  leftIcon="block"
                >
                  Revoke Session
                </Button>
              </div>
            </div>
          )}
          emptyMessage="No sessions found"
        />
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={initialPage}
        pageSize={20}
        totalItems={initialTotal}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        isPending={isPending}
        className="mt-6"
      />

      {/* Revoke Modal */}
      {revokeModalSession && (
        <Modal
          isOpen={true}
          onClose={() => setRevokeModalSession(null)}
          title="Revoke Session"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Are you sure you want to revoke this session? The user will be logged out immediately.
            </p>
            <div className="p-4 rounded-lg border border-border-dark space-y-2 bg-input">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">User:</span>
                <span className="text-white">{revokeModalSession.userEmail}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">IP:</span>
                <span className="text-white">{revokeModalSession.ipAddress}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Device:</span>
                <span className="text-white">{parseUserAgent(revokeModalSession.userAgent)}</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setRevokeModalSession(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleRevoke}
                isLoading={isRevoking}
                disabled={isRevoking}
              >
                Revoke Session
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
