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
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

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

// Group permissions by subject
interface SubjectGroup {
  subject: ScopedPermission["subject"];
  permissions: ScopedPermission[];
}

function groupBySubject(permissions: ScopedPermission[]): SubjectGroup[] {
  const grouped = new Map<string, SubjectGroup>();

  for (const perm of permissions) {
    const key = `${perm.subject.type}:${perm.subject.id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        subject: perm.subject,
        permissions: []
      });
    }
    grouped.get(key)!.permissions.push(perm);
  }

  return Array.from(grouped.values());
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
  const [editingSubjectGroup, setEditingSubjectGroup] = React.useState<SubjectGroup | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [removingGroup, setRemovingGroup] = React.useState<SubjectGroup | null>(null);
  const [expandedSubjects, setExpandedSubjects] = React.useState<Set<string>>(new Set());

  const filteredPermissions = subjectFilter
    ? permissions.filter(
      (p) => p.subject.id === subjectFilter.id || p.subject.name === subjectFilter.name
    )
    : permissions;

  // Group permissions by subject
  const subjectGroups = React.useMemo(() =>
    groupBySubject(filteredPermissions),
    [filteredPermissions]
  );

  const totalPages = Math.ceil(subjectGroups.length / ITEMS_PER_PAGE);
  const displayedGroups = subjectGroups.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const toggleExpand = (subjectKey: string) => {
    setExpandedSubjects(prev => {
      const next = new Set(prev);
      if (next.has(subjectKey)) {
        next.delete(subjectKey);
      } else {
        next.add(subjectKey);
      }
      return next;
    });
  };

  const handleAdd = () => {
    if (disabled) return;
    setEditingSubjectGroup(null);
    setIsModalOpen(true);
  };

  const handleEditGroup = (group: SubjectGroup) => {
    if (disabled) return;
    setEditingSubjectGroup(group);
    setIsModalOpen(true);
  };

  const handleSavePermission = (perms: Partial<ScopedPermission>[]) => {
    onSave(perms);
  };

  const handleRemoveGroup = (group: SubjectGroup) => {
    // Remove all permissions for this subject
    group.permissions.forEach(p => onRemove(p.id));
    setRemovingGroup(null);
  };

  const handleRemoveSinglePermission = (id: string) => {
    onRemove(id);
  };

  // Render a single permission row (for expanded view)
  const renderPermissionBadge = (perm: ScopedPermission) => (
    <div key={perm.id} className="flex items-center gap-2 py-1">
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
      <Badge variant="info" className="font-mono bg-[#243647]/50 border-blue-900/30 text-blue-200 ml-2">
        {perm.relation}
      </Badge>
      {!disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveSinglePermission(perm.id);
          }}
          className="ml-auto p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-[#243647] transition-colors"
          title="Remove this permission"
        >
          <Icon name="close" size="sm" />
        </button>
      )}
    </div>
  );

  if (subjectGroups.length === 0 && !subjectFilter) {
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
          initialPermissions={editingSubjectGroup?.permissions}
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
              {!subjectFilter && <TableHead>Subject</TableHead>}
              <TableHead>Permissions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedGroups.map((group) => {
              const subjectKey = `${group.subject.type}:${group.subject.id}`;
              const isExpanded = expandedSubjects.has(subjectKey);

              return (
                <TableRow key={subjectKey} className="align-top">
                  {!subjectFilter && (
                    <TableCell className="w-[250px]">
                      <div className="flex items-center gap-3">
                        <SubjectAvatar type={group.subject.type} avatarUrl={group.subject.avatarUrl} />
                        <div className="flex flex-col">
                          <span className="font-medium text-sm text-white">
                            {group.subject.name}
                          </span>
                          {group.subject.description && (
                            <span className="text-xs text-gray-400">
                              {group.subject.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {/* Summary view - show first 2 permissions as badges */}
                      <div className="flex flex-wrap gap-2">
                        {group.permissions.slice(0, isExpanded ? 0 : 2).map(perm => (
                          <div key={perm.id} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800/50 border border-slate-700">
                            <span className="text-xs font-mono text-blue-300">{perm.resourceType}</span>
                            <span className="text-gray-500">:</span>
                            <Badge variant="info" className="text-[10px] px-1.5 py-0 bg-[#243647]/50 border-blue-900/30 text-blue-200">
                              {perm.relation}
                            </Badge>
                          </div>
                        ))}
                        {!isExpanded && group.permissions.length > 2 && (
                          <button
                            onClick={() => toggleExpand(subjectKey)}
                            className="text-xs text-primary hover:text-primary/80 px-2 py-1"
                          >
                            +{group.permissions.length - 2} more
                          </button>
                        )}
                      </div>

                      {/* Expanded view - show all permissions with details */}
                      {isExpanded && (
                        <div className="mt-2 pl-2 border-l-2 border-slate-700 space-y-1">
                          {group.permissions.map(renderPermissionBadge)}
                        </div>
                      )}

                      {/* Toggle button */}
                      {group.permissions.length > 2 && (
                        <button
                          onClick={() => toggleExpand(subjectKey)}
                          className="text-xs text-gray-400 hover:text-white flex items-center gap-1 mt-1"
                        >
                          <Icon name={isExpanded ? "expand_less" : "expand_more"} size="sm" />
                          {isExpanded ? "Collapse" : `Show all ${group.permissions.length} permissions`}
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEditGroup(group)}
                        className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#243647] transition-colors"
                        title="Edit all permissions"
                      >
                        <Icon name="edit" size="sm" />
                      </button>
                      <button
                        onClick={() => setRemovingGroup(group)}
                        className="p-1 rounded-md text-gray-400 hover:text-red-400 hover:bg-[#243647] transition-colors"
                        title="Remove all permissions"
                      >
                        <Icon name="delete" size="sm" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {displayedGroups.length === 0 && (
              <TableRow>
                <TableCell colSpan={subjectFilter ? 2 : 3} className="text-center py-8 text-gray-500">
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
        initialPermissions={editingSubjectGroup?.permissions}
        resourceConfig={resourceConfig}
        apiKeys={apiKeys}
        fixedSubject={subjectFilter}
      />

      <ConfirmationModal
        isOpen={!!removingGroup}
        onClose={() => setRemovingGroup(null)}
        onConfirm={() => {
          if (removingGroup) {
            handleRemoveGroup(removingGroup);
          }
        }}
        title="Remove All Permissions"
        description={`Are you sure you want to remove all ${removingGroup?.permissions.length || 0} permissions for ${removingGroup?.subject.name}? This may affect access immediately.`}
        confirmText="Remove All"
      />
    </div>
  );
}
