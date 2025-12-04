"use client";

import * as React from "react";
import { Modal, ModalFooter, Button, Select, SegmentedControl, SubjectCard, UserGroupPicker } from "@/components/ui";
import { type User, type Group } from "@/components/ui/user-group-picker";

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "User";
  addedOn: string;
  avatarUrl?: string;
  isGroup?: boolean;
  memberCount?: number;
}

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (member: Partial<PlatformUser>) => void;
  initialData?: PlatformUser | null;
}

export function AddMemberModal({ isOpen, onClose, onSave, initialData }: AddMemberModalProps) {
  const [role, setRole] = React.useState<"Owner" | "Admin" | "User">("User");
  const [subjectType, setSubjectType] = React.useState<"user" | "group">("user");
  const [selectedSubject, setSelectedSubject] = React.useState<User | Group | null>(null);
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);

  React.useEffect(() => {
    if (initialData) {
      setRole(initialData.role);
      setSubjectType(initialData.isGroup ? "group" : "user");
      if (initialData.isGroup) {
        setSelectedSubject({
          id: initialData.id,
          name: initialData.name,
          memberCount: initialData.memberCount || 0,
        } as Group);
      } else {
        setSelectedSubject({
          id: initialData.id,
          name: initialData.name,
          email: initialData.email,
          image: initialData.avatarUrl,
        } as User);
      }
    } else {
      setRole("User");
      setSubjectType("user");
      setSelectedSubject(null);
    }
  }, [initialData, isOpen]);

  const handleSubjectSelect = (subject: User | Group) => {
    setSelectedSubject(subject);
  };

  const handleSubmit = () => {
    if (!selectedSubject) return;

    const isGroup = subjectType === "group";
    const email = isGroup ? `${(selectedSubject as Group).memberCount} members` : (selectedSubject as User).email;

    onSave({
      id: selectedSubject.id,
      name: selectedSubject.name || "",
      email: email,
      role,
      isGroup,
      addedOn: initialData?.addedOn || new Date().toISOString().split("T")[0],
      avatarUrl: !isGroup ? (selectedSubject as User).image || undefined : undefined,
      memberCount: isGroup ? (selectedSubject as Group).memberCount : undefined,
    });
    onClose();
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={initialData ? "Edit Member" : "Add Member"}
        size="md"
      >
        <div className="space-y-6">
          {/* Subject Type Toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">Type</label>
            <SegmentedControl
              options={[
                { value: "user", label: "User" },
                { value: "group", label: "Group" },
              ]}
              value={subjectType}
              onChange={(val) => {
                setSubjectType(val as "user" | "group");
                setSelectedSubject(null);
              }}
              disabled={!!initialData}
            />
          </div>

          {/* Subject Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">
              {subjectType === "user" ? "User" : "Group"}
            </label>

            {selectedSubject ? (
              <SubjectCard
                subject={{
                  name: selectedSubject.name || "",
                  type: subjectType === "group" ? "Group" : "User",
                  description: subjectType === "user"
                    ? (selectedSubject as User).email
                    : `${(selectedSubject as Group).memberCount} members`,
                  avatarUrl: subjectType === "user" ? ((selectedSubject as User).image || undefined) : undefined
                }}
                onRemove={!initialData ? () => setSelectedSubject(null) : undefined}
              />
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-between"
                onClick={() => setIsPickerOpen(true)}
                rightIcon="search"
              >
                Select {subjectType === "user" ? "User" : "Group"}...
              </Button>
            )}
          </div>

          {/* Role Selection */}
          <Select
            label="Role"
            value={role}
            onChange={(val) => setRole(val as "Owner" | "Admin" | "User")}
            options={[
              { value: "Owner", label: "Owner" },
              { value: "Admin", label: "Admin" },
              { value: "User", label: "User" },
            ]}
          />

          <div className="text-xs text-gray-400 bg-slate-800/50 p-3 rounded-lg">
            {role === "Owner" && "Full access to manage the client and all its settings."}
            {role === "Admin" && "Can manage settings and users, but cannot delete the client."}
            {role === "User" && "Can only view settings."}
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedSubject}
          >
            {initialData ? "Save Changes" : "Add Member"}
          </Button>
        </ModalFooter>
      </Modal>

      <UserGroupPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        type={subjectType}
        onSelect={handleSubjectSelect}
      />
    </>
  );
}
