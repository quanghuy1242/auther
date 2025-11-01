"use client";

import * as React from "react";
import { Modal, Button, Input, Icon } from "@/components/ui";
import { getAllUsers, type UserPickerItem } from "@/app/admin/users/actions";
import { getAllGroups } from "@/app/admin/clients/[id]/access/actions";

export interface User {
  id: string;
  name: string | null;
  email: string;
  image?: string | null;
}

export interface Group {
  id: string;
  name: string;
  memberCount: number;
}

export interface UserGroupPickerProps {
  isOpen: boolean;
  onClose: () => void;
  type: "user" | "group";
  onSelect: (selected: User | Group) => void;
  excludeIds?: string[];
  title?: string;
}

/**
 * User/Group Picker modal component for selecting users or groups
 * Includes search functionality and displays avatars/icons
 * 
 * @example
 * <UserGroupPicker
 *   isOpen={showPicker}
 *   onClose={() => setShowPicker(false)}
 *   type="user"
 *   onSelect={(user) => handleAddUser(user)}
 *   excludeIds={assignedUserIds}
 * />
 */
export function UserGroupPicker({
  isOpen,
  onClose,
  type,
  onSelect,
  excludeIds = [],
  title,
}: UserGroupPickerProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [users, setUsers] = React.useState<UserPickerItem[]>([]);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Load data when modal opens
  React.useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (type === "user") {
          const fetchedUsers = await getAllUsers();
          setUsers(fetchedUsers);
        } else {
          const fetchedGroups = await getAllGroups();
          setGroups(fetchedGroups);
        }
      } catch (err) {
        console.error("Failed to load data:", err);
        setError("Failed to load data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, type]);

  const items = type === "user" ? users : groups;

  const filteredItems = items.filter((item) => {
    if (excludeIds.includes(item.id)) return false;
    if (!searchQuery) return true;
    
    const name = item.name?.toLowerCase() || "";
    const query = searchQuery.toLowerCase();
    
    return name.includes(query) ||
      (type === "user" && (item as User).email.toLowerCase().includes(query));
  });

  const handleSelect = (item: User | Group) => {
    onSelect(item);
    onClose();
    setSearchQuery("");
  };

  const modalTitle = title || (type === "user" ? "Add User" : "Add Group");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <div className="flex flex-col gap-4">
        {/* Search input */}
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${type === "user" ? "users" : "groups"}...`}
            className="pl-10 bg-input border-slate-700"
          />
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-8 text-gray-400">
            Loading {type === "user" ? "users" : "groups"}...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-8 text-red-400">
            {error}
          </div>
        )}

        {/* List of items */}
        {!loading && !error && (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredItems.length === 0 ? (
              <p className="text-center py-8 text-gray-400">
                No {type === "user" ? "users" : "groups"} found
              </p>
            ) : (
              filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#243647] transition-colors text-left"
              >
                {type === "user" ? (
                  <>
                    <div
                      className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 shrink-0"
                      style={{
                        backgroundImage: `url(${(item as User).image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.name}`})`,
                      }}
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium text-white truncate">
                        {item.name}
                      </span>
                      <span className="text-xs text-[#93adc8] truncate">
                        {(item as User).email}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center rounded-full size-10 bg-slate-700 text-slate-400 shrink-0">
                      <Icon name="group" className="text-lg" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium text-white truncate">
                        {item.name}
                      </span>
                      <span className="text-xs text-[#93adc8]">
                        {(item as Group).memberCount} members
                      </span>
                    </div>
                  </>
                )}
              </button>
            ))
          )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
