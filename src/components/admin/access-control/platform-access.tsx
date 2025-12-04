"use client";

import * as React from "react";
import { Button, EmptyState } from "@/components/ui";
import { AccessControlTable, type AccessControlEntry } from "@/components/admin/access-control-table";
import { AddMemberModal, type PlatformUser } from "./add-member-modal";
import { SectionHeader } from "@/components/ui/section-header";

interface PlatformAccessProps {
  users: PlatformUser[];
  onUpdate: (user: PlatformUser) => void;
  onRemove: (id: string) => void;
}

export function PlatformAccess({ users, onUpdate, onRemove }: PlatformAccessProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingMember, setEditingMember] = React.useState<PlatformUser | null>(null);

  const handleEdit = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (user) {
      setEditingMember(user);
      setIsModalOpen(true);
    }
  };

  const handleAdd = () => {
    setEditingMember(null);
    setIsModalOpen(true);
  };

  const handleSave = (memberData: Partial<PlatformUser>) => {
    if (editingMember) {
      onUpdate({ ...editingMember, ...memberData } as PlatformUser);
    } else {
      // Create new
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

  // Convert PlatformUser to AccessControlEntry for the table
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
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <SectionHeader
        title="Platform Members"
        description="Manage users and groups with high-level roles (Owner, Admin, User)."
        action={
          <Button onClick={handleAdd} leftIcon="add">
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
            <Button onClick={handleAdd} variant="secondary">
              Add Member
            </Button>
          }
        />
      ) : (
        <AccessControlTable
          entries={tableEntries}
          onRemove={onRemove}
          onEdit={handleEdit}
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
