"use client";

import * as React from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Icon,
  Badge,
  EmptyState,
  Alert
} from "@/components/ui";
import { AddPermissionModal, type ScopedPermission, type ApiKey } from "./add-permission-modal";
import { SectionHeader } from "@/components/ui/section-header";
import { SubjectAvatar } from "@/components/ui/subject-avatar";

interface ScopedPermissionsProps {
  permissions: ScopedPermission[];
  onSave: (permissions: Partial<ScopedPermission>[]) => void;
  onRemove: (id: string) => void;
  resourceConfig: Record<string, string[]>;
  apiKeys: ApiKey[];
  subjectFilter?: {
    id: string;
    name: string;
    type: "User" | "Group" | "ApiKey";
  };
  disabled?: boolean;
}

const ITEMS_PER_PAGE = 10;

export function ScopedPermissions({
  permissions,
  onSave,
  onRemove,
  resourceConfig,
  apiKeys,
  subjectFilter,
  disabled,
}: ScopedPermissionsProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingPermission, setEditingPermission] = React.useState<ScopedPermission | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);

  const filteredPermissions = subjectFilter
    ? permissions.filter(
      (p) => p.subject.id === subjectFilter.id || p.subject.name === subjectFilter.name
    )
    : permissions;

  const totalPages = Math.ceil(filteredPermissions.length / ITEMS_PER_PAGE);
  const displayedPermissions = filteredPermissions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleAdd = () => {
    if (disabled) return;
    setEditingPermission(null);
    setIsModalOpen(true);
  };

  const handleEdit = (perm: ScopedPermission) => {
    if (disabled) return;
    setEditingPermission(perm);
    setIsModalOpen(true);
  };

  const handleSavePermission = (perms: Partial<ScopedPermission>[]) => {
    onSave(perms);
  };

  if (filteredPermissions.length === 0 && !subjectFilter) {
    return (
      <div className="space-y-4">
        {disabled && <Alert variant="info" title="View Only">You need Admin or Owner role to manage permissions.</Alert>}
        <SectionHeader
          title="Scoped Permissions"
          description="Define fine-grained access rules for specific resources."
          action={<Button onClick={handleAdd} leftIcon="add" disabled={disabled}>Add Permission</Button>}
        />
        <EmptyState
          icon="lock_person"
          title="No scoped permissions"
          description="Define fine-grained access control rules for specific resources."
          action={
            <Button onClick={handleAdd} variant="secondary" disabled={disabled}>Add Permission</Button>
          }
        />
        <AddPermissionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSavePermission}
          initialData={editingPermission}
          resourceConfig={resourceConfig}
          apiKeys={apiKeys}
          fixedSubject={subjectFilter}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {disabled && <Alert variant="info" title="View Only">You need Admin or Owner role to manage permissions.</Alert>}
      <SectionHeader
        title="Scoped Permissions"
        description="Define fine-grained access rules for specific resources."
        action={
          <Button onClick={handleAdd} leftIcon="add" disabled={disabled}>
            Add Permission
          </Button>
        }
      />

      <div className="rounded-lg border border-[#243647] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource</TableHead>
              <TableHead>Relation</TableHead>
              {!subjectFilter && <TableHead>Subject</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedPermissions.map((perm) => (
              <TableRow key={perm.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-xs font-mono text-blue-300 border border-slate-700">
                        {perm.resourceType}
                      </span>
                      <span className="text-gray-500 text-xs">:</span>
                      {perm.condition ? (
                        <Badge variant="info" className="bg-purple-900/30 text-purple-300 border-purple-500/30 gap-1">
                          <Icon name="code" className="text-[12px]" />
                          Script
                        </Badge>
                      ) : perm.resourceId === "*" ? (
                        <Icon name="globe" size="sm" className="text-primary" />
                      ) : (
                        <span className="font-mono text-xs text-gray-300">
                          #{perm.resourceId}
                        </span>
                      )}
                    </div>
                    {perm.condition && (
                      <div className="text-[10px] text-gray-400 font-mono bg-slate-900/50 p-1 rounded max-w-[200px] truncate border border-slate-800">
                        {perm.condition}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="info" className="font-mono bg-[#243647]/50 border-blue-900/30 text-blue-200">
                    {perm.relation}
                  </Badge>
                </TableCell>
                {!subjectFilter && (
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <SubjectAvatar type={perm.subject.type} avatarUrl={perm.subject.avatarUrl} />
                      <div className="flex flex-col">
                        <span className="font-medium text-sm text-white">
                          {perm.subject.name}
                        </span>
                        {perm.subject.description && (
                          <span className="text-xs text-gray-400">
                            {perm.subject.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleEdit(perm)}
                      className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#243647] transition-colors"
                    >
                      <Icon name="edit" size="sm" />
                    </button>
                    <button
                      onClick={() => onRemove(perm.id)}
                      className="p-1 rounded-md text-gray-400 hover:text-red-400 hover:bg-[#243647] transition-colors"
                    >
                      <Icon name="delete" size="sm" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {displayedPermissions.length === 0 && (
              <TableRow>
                <TableCell colSpan={subjectFilter ? 3 : 4} className="text-center py-8 text-gray-500">
                  No permissions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            leftIcon="chevron_left"
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            rightIcon="chevron_right"
          >
            Next
          </Button>
        </div>
      )}

      <AddPermissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSavePermission}
        initialData={editingPermission}
        resourceConfig={resourceConfig}
        apiKeys={apiKeys}
        fixedSubject={subjectFilter}
      />
    </div>
  );
}
