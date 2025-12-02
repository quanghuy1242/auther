"use client";

import * as React from "react";
import { Badge } from "@/components/ui";
import { formatDateShort } from "@/lib/utils/date-formatter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ApiKey {
  keyId: string;
  owner: string;
  created: Date;
  expires: Date | null;
  permissions: string;
  status: "active" | "revoked";
}

export interface ApiKeyTableProps {
  apiKeys: ApiKey[];
  onRevoke: (keyId: string) => void;
}

/**
 * API Key Table component for displaying issued API keys
 * Shows key metadata, status badges, and revoke actions
 */
export function ApiKeyTable({ apiKeys, onRevoke }: ApiKeyTableProps) {
  if (apiKeys.length === 0) {
    return (
      <div className="rounded-lg border border-border-dark p-8 text-center bg-card">
        <p className="text-gray-400 text-sm">
          No API keys have been issued for this client yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-dark bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-card hover:bg-card">
            <TableHead>Key ID</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.map((key) => (
            <TableRow key={key.keyId}>
              <TableCell className="font-mono text-gray-400">{key.keyId}</TableCell>
              <TableCell className="text-gray-400">{key.owner}</TableCell>
              <TableCell className="text-gray-400">{formatDateShort(key.created)}</TableCell>
              <TableCell className="text-gray-400">
                {key.expires ? formatDateShort(key.expires) : "Never"}
              </TableCell>
              <TableCell className="font-mono text-gray-400 max-w-xs truncate">
                {key.permissions}
              </TableCell>
              <TableCell>
                {key.status === "active" ? (
                  <Badge variant="success" dot>
                    Active
                  </Badge>
                ) : (
                  <Badge variant="default" dot>
                    Revoked
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {key.status === "active" ? (
                  <button
                    type="button"
                    onClick={() => onRevoke(key.keyId)}
                    className="text-error hover:text-red-500 text-sm font-medium transition-colors"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
