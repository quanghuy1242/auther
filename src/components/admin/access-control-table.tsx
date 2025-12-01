"use client";

import * as React from "react";
import { Icon } from "@/components/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AccessControlEntry {
  id: string;
  name: string;
  type: "user" | "group";
  avatar?: string;
  email?: string;
  accessLevel: string;
  memberCount?: number;
}

export interface AccessControlTableProps {
  entries: AccessControlEntry[];
  onRemove: (id: string) => void;
  onEdit?: (id: string) => void;
}

/**
 * Access Control Table component for displaying assigned users/groups
 * Shows user avatars or group icons with access levels and actions
 */
export function AccessControlTable({
  entries,
  onRemove,
  onEdit,
}: AccessControlTableProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 p-8 text-center">
        <p className="text-gray-400 text-sm">
          No users or groups assigned yet. Click &quot;Add User&quot; or &quot;Add Group&quot; to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="bg-input/60 hover:bg-input/60">
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Access Level</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {entry.type === "user" ? (
                    <div
                      className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8 shrink-0"
                      style={{
                        backgroundImage: `url(${entry.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.name}`})`,
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center rounded-full size-8 bg-slate-700 text-slate-400 shrink-0">
                      <Icon name="group" className="text-lg" />
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{entry.name}</span>
                    {entry.type === "user" && entry.email && (
                      <span className="text-xs text-[#93adc8] truncate">
                        {entry.email}
                      </span>
                    )}
                    {entry.type === "group" && entry.memberCount !== undefined && (
                      <span className="text-xs text-[#93adc8]">
                        {entry.memberCount} members
                      </span>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-[#93adc8] capitalize">{entry.type}</TableCell>
              <TableCell className="text-[#93adc8]">{entry.accessLevel}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(entry.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[#243647] hover:text-white transition-colors"
                      title="Edit access level"
                    >
                      <Icon name="edit" className="text-lg" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[#243647] hover:text-red-500 transition-colors"
                    title="Remove access"
                  >
                    <Icon name="delete" className="text-lg" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
