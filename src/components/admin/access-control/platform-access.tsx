"use client";

import * as React from "react";
import { Button, EmptyState, Alert } from "@/components/ui";
import { AccessControlTable, type AccessControlEntry } from "@/components/admin/access-control-table";
import { AddMemberModal, type PlatformUser } from "./add-member-modal";
import { SectionHeader } from "@/components/ui/section-header";

interface PlatformAccessProps {
  users: PlatformUser[];
  onUpdate: (user: PlatformUser) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export function PlatformAccess({ users, onUpdate, onRemove, disabled }: PlatformAccessProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingMember, setEditingMember] = React.useState<PlatformUser | null>(null);

  const handleEdit = (id: string) => {
    if (disabled) return;
    const user = users.find((u) => u.id === id);
    if (user) {
      setEditingMember(user);
      setIsModalOpen(true);
    }
  };

  const handleAdd = () => {
    if (disabled) return;
    setEditingMember(null);
    setIsModalOpen(true);
  };

  const handleSave = (memberData: Partial<PlatformUser>) => {
    if (editingMember) {
      onUpdate({ ...editingMember, ...memberData } as PlatformUser);
    } else {
      const newUser: PlatformUser = {
        id: memberData.id || Math.random().toString(36).substr(2, 9),
        name: memberData.name || "Unknown",
        email: memberData.email || "",
        role: memberData.role || "User",
        addedOn: new Date().toISOString().split("T")[0],
        isGroup: memberData.isGroup,
        memberCount: memberData.memberCount,
        avatarUrl: memberData.avatarUrl,
      };
      onUpdate(newUser);
    }
  };

  const tableEntries: AccessControlEntry[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    type: u.isGroup ? "group" : "user",
    avatar: u.avatarUrl,
    email: u.email,
    accessLevel: u.role,
    memberCount: u.memberCount,
  }));

  return (
    <div className="space-y-4">
      {disabled && <Alert variant="info" title="View Only">You need Admin or Owner role to manage permissions.</Alert>}
      <SectionHeader
        title="Platform Members"
        description="Manage users and groups with high-level roles (Owner, Admin, User)."
        action={
          <Button onClick={handleAdd} leftIcon="add" disabled={disabled}>
            Add Member
          </Button>
        }
      />

      {users.length === 0 ? (
        <EmptyState
          icon="group_add"
          title="No members found"
          description="Add users or groups to manage access to this client."
          action={
            <Button onClick={handleAdd} variant="secondary" disabled={disabled}>
              Add Member
            </Button>
          }
        />
      ) : (
        <AccessControlTable
          entries={tableEntries}
          onRemove={disabled ? undefined : onRemove}
          onEdit={disabled ? undefined : handleEdit}
        />
      )}

      <AddMemberModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingMember}
      />
    </div>
  );
}
