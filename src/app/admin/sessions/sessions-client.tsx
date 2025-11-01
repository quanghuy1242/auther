"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Icon, Badge, Input, Checkbox, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Modal } from "@/components/ui";
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
  const [search, setSearch] = React.useState(initialSearch);
  const [activeOnly, setActiveOnly] = React.useState(initialActiveOnly);
  const [revokeModalSession, setRevokeModalSession] = React.useState<Session | null>(null);
  const [isRevoking, setIsRevoking] = React.useState(false);
  const [isCleaningUp, setIsCleaningUp] = React.useState(false);
  const isInitialMount = React.useRef(true);

  // Debounced search
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) {
        params.set("search", search);
      } else {
        params.delete("search");
      }
      params.delete("page"); // Reset to page 1 on search
      router.push(`/admin/sessions?${params.toString()}`);
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleFilterChange = (newActiveOnly: boolean) => {
    setActiveOnly(newActiveOnly);
    const params = new URLSearchParams(searchParams.toString());
    if (newActiveOnly) {
      params.set("activeOnly", "true");
    } else {
      params.delete("activeOnly");
    }
    params.delete("page");
    router.push(`/admin/sessions?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/admin/sessions?${params.toString()}`);
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
      <div className="mb-6 p-0 rounded-lg border border-white/10" style={{ backgroundColor: '#1a2632' }}>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:max-w-md">
              <Input
                placeholder="Search by email, name, or IP address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon="search"
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

      <div className="rounded-lg border-0 sm:border sm:border-border-dark" style={{ backgroundColor: '#1a2632' }}>
        <div className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                      <Icon name="search_off" className="text-4xl mb-2" />
                      <p>No sessions found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  initialSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-white">
                            {session.userName || "Unknown"}
                          </p>
                          <p className="text-xs text-gray-400">{session.userEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon name="devices" className="text-gray-400" />
                          <span className="text-sm">{parseUserAgent(session.userAgent)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-gray-400">
                          {session.ipAddress || "N/A"}
                        </code>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-400">
                          {formatTimeAgo(session.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-400">
                          {formatTimeAgo(session.updatedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {isExpired(session.expiresAt) ? (
                          <Badge variant="default">Expired</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokeModalSession(session)}
                          leftIcon="block"
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePageChange(initialPage - 1)}
                disabled={initialPage === 1}
                leftIcon="chevron_left"
              >
                Previous
              </Button>
              <span className="text-sm text-gray-400">
                Page {initialPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePageChange(initialPage + 1)}
                disabled={initialPage === totalPages}
                rightIcon="chevron_right"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

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
            <div className="p-4 rounded-lg border border-white/10 space-y-2" style={{ backgroundColor: '#0a0f14' }}>
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
