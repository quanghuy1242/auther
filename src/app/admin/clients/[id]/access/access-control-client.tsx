"use client";

import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Icon,
  Label,
  Modal,
  Input,
  Badge,
  Select,
  UserGroupPicker,
  PermissionRowBuilder,
  type User,
  type PermissionRow,
} from "@/components/ui";
import { formatDate } from "@/lib/utils/date-formatter";
import type { ClientDetail } from "../actions";
import {
  getClientMetadata,
  updateClientAccessPolicy,
  getClientUsers,
  assignUserToClient,
  removeUserFromClient,
  updateUserAccess,
  getAllGroups,
  createUserGroup,
} from "./actions";

interface AccessControlClientProps {
  client: ClientDetail;
}

interface ClientMetadata {
  accessPolicy: "all_users" | "restricted";
  allowsApiKeys: boolean;
  allowedResources: Record<string, string[]> | null;
  defaultApiKeyPermissions: Record<string, string[]> | null;
}

interface ClientUser {
  userId: string;
  userName: string | null;
  userEmail: string;
  accessLevel: string;
  expiresAt: Date | null;
  createdAt: Date;
}

interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: Date;
}

const ACCESS_LEVELS: Array<{ value: "use" | "admin"; label: string; description: string }> = [
  { value: "use", label: "Use", description: "Can use the client for OAuth" },
  { value: "admin", label: "Admin", description: "Full client management" },
];

export function AccessControlClient({ client }: AccessControlClientProps) {
  const [loading, setLoading] = React.useState(true);
  const [metadata, setMetadata] = React.useState<ClientMetadata | null>(null);
  const [users, setUsers] = React.useState<ClientUser[]>([]);
  const [groups, setGroups] = React.useState<UserGroup[]>([]);

  // Modal states
  const [showAssignUserModal, setShowAssignUserModal] = React.useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = React.useState(false);
  const [showEditAccessModal, setShowEditAccessModal] = React.useState(false);
  const [showUserPicker, setShowUserPicker] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<ClientUser | null>(null);

  // Form states
  const [assignUserId, setAssignUserId] = React.useState("");
  const [assignAccessLevel, setAssignAccessLevel] = React.useState<"use" | "admin">("use");
  const [assignExpiresInDays, setAssignExpiresInDays] = React.useState("");
  const [groupName, setGroupName] = React.useState("");
  const [groupDescription, setGroupDescription] = React.useState("");
  const [editAccessLevel, setEditAccessLevel] = React.useState<"use" | "admin">("use");
  const [editExpiresInDays, setEditExpiresInDays] = React.useState("");
  const [allowedResources, setAllowedResources] = React.useState<PermissionRow[]>([]);
  const [isSavingResources, setIsSavingResources] = React.useState(false);

  // Error/success states
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Load data
  React.useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [metadataResult, usersResult, groupsResult] = await Promise.all([
        getClientMetadata(client.clientId),
        getClientUsers(client.clientId),
        getAllGroups(),
      ]);

      if (metadataResult) {
        setMetadata(metadataResult);
        
        // Convert allowedResources from JSON to PermissionRow[] format
        if (metadataResult.allowedResources) {
          const resourceRows: PermissionRow[] = Object.entries(
            metadataResult.allowedResources
          ).map(([resource, actions]) => ({
            resource,
            actions: actions.join(", "),
          }));
          setAllowedResources(resourceRows);
        } else {
          setAllowedResources([]);
        }
      }
      setUsers(usersResult);
      setGroups(groupsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAccessPolicy = async () => {
    if (!metadata) return;

    const newPolicy = metadata.accessPolicy === "all_users" ? "restricted" : "all_users";
    
    // Access policy and API keys are tightly coupled:
    // - Restricted mode: Enable API keys (needed for access control)
    // - All users mode: Disable API keys (not needed, everyone has access anyway)
    // Note: Existing API keys will continue to work, but new ones cannot be created
    const shouldAllowApiKeys = newPolicy === "restricted";
    
    const result = await updateClientAccessPolicy({
      clientId: client.clientId,
      accessPolicy: newPolicy,
      allowsApiKeys: shouldAllowApiKeys,
    });

    if (result.success) {
      setSuccess(
        newPolicy === "restricted"
          ? "Switched to restricted access. API keys are now enabled."
          : "Switched to open access. All users can now use this client."
      );
      await loadData();
    } else {
      setError(result.error || "Failed to update policy");
    }
  };

  const handleSaveResources = async () => {
    if (!metadata) return;

    setIsSavingResources(true);
    setError(null);

    try {
      // Convert PermissionRow[] to ResourcePermissions JSON format
      const resourcesJson: Record<string, string[]> = {};
      
      for (const row of allowedResources) {
        const resource = row.resource.trim();
        const actions = row.actions
          .split(",")
          .map((a) => a.trim())
          .filter((a) => a.length > 0);
        
        if (resource && actions.length > 0) {
          resourcesJson[resource] = actions;
        }
      }

      const result = await updateClientAccessPolicy({
        clientId: client.clientId,
        accessPolicy: metadata.accessPolicy,
        allowsApiKeys: metadata.allowsApiKeys,
        allowedResources: Object.keys(resourcesJson).length > 0 ? resourcesJson : undefined,
      });

      if (result.success) {
        setSuccess("Allowed resources updated successfully");
        await loadData();
      } else {
        setError(result.error || "Failed to update resources");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save resources");
    } finally {
      setIsSavingResources(false);
    }
  };

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = await assignUserToClient({
      userId: assignUserId,
      clientId: client.clientId,
      accessLevel: assignAccessLevel,
      expiresInDays: assignExpiresInDays ? Number.parseInt(assignExpiresInDays) : undefined,
    });

    if (result.success) {
      setSuccess(`User assigned successfully`);
      setShowAssignUserModal(false);
      setAssignUserId("");
      setAssignAccessLevel("use");
      setAssignExpiresInDays("");
      await loadData();
    } else {
      setError(result.error || "Failed to assign user");
    }
  };

  const handleRemoveUser = async (userId: string, userName: string | null) => {
    if (!confirm(`Remove ${userName || "this user"}'s access?`)) return;

    const result = await removeUserFromClient(userId, client.clientId);

    if (result.success) {
      setSuccess("User access removed");
      await loadData();
    } else {
      setError(result.error || "Failed to remove user");
    }
  };

  const handleEditAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    const result = await updateUserAccess(
      selectedUser.userId,
      client.clientId,
      {
        accessLevel: editAccessLevel,
        expiresInDays: editExpiresInDays ? Number.parseInt(editExpiresInDays) : undefined,
      }
    );

    if (result.success) {
      setSuccess("Access updated successfully");
      setShowEditAccessModal(false);
      setSelectedUser(null);
      setEditAccessLevel("use");
      setEditExpiresInDays("");
      await loadData();
    } else {
      setError(result.error || "Failed to update access");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = await createUserGroup({
      name: groupName,
      description: groupDescription || undefined,
    });

    if (result.success) {
      setSuccess(`Group "${groupName}" created`);
      setShowCreateGroupModal(false);
      setGroupName("");
      setGroupDescription("");
      await loadData();
    } else {
      setError(result.error || "Failed to create group");
    }
  };

  const openEditModal = (user: ClientUser) => {
    setSelectedUser(user);
    setEditAccessLevel(user.accessLevel as "use" | "admin");
    setEditExpiresInDays("");
    setShowEditAccessModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-[#93adc8]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success/Error Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            <Icon name="close" />
          </Button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-200 flex items-center justify-between">
          <span>{success}</span>
          <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>
            <Icon name="close" />
          </Button>
        </div>
      )}

      {/* Access Policy Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Access Policy</CardTitle>
            <Badge variant={metadata?.accessPolicy === "all_users" ? "success" : "warning"}>
              {metadata?.accessPolicy === "all_users" ? "Open" : "Restricted"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-[#93adc8]">
              {metadata?.accessPolicy === "all_users"
                ? "All users can authorize with this client. No explicit access assignment needed."
                : "Only users with explicit access can authorize with this client."}
            </p>
            <Button variant="secondary" size="sm" onClick={handleToggleAccessPolicy}>
              Switch to {metadata?.accessPolicy === "all_users" ? "Restricted" : "Open"} Access
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Allowed Resources & Actions Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Allowed Resources & Actions</CardTitle>
            <Badge variant="default">
              {allowedResources.filter((r) => r.resource.trim() && r.actions.trim()).length} Resources
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-[#93adc8] text-sm">
              Define the resources and actions that this client can access. API keys created for this client will be constrained to these permissions.
            </p>
            
            <PermissionRowBuilder
              permissions={allowedResources}
              onChange={setAllowedResources}
              resourcePlaceholder="Resource name (e.g., invoices, projects)"
              actionsPlaceholder="Actions (e.g., read, write, delete)"
              description="Add resources with comma-separated actions. Example: 'invoices' with 'read, write, delete'"
              minRows={0}
            />
            
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveResources}
                disabled={isSavingResources}
              >
                {isSavingResources ? "Saving..." : "Save Resources"}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadData()}
                disabled={isSavingResources}
              >
                Reset
              </Button>
              
              {allowedResources.length === 0 && (
                <p className="text-sm text-yellow-400/80">
                  ⚠️ No resources defined - API keys will have no permissions
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Access Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>User Access ({users.length})</CardTitle>
            <Button size="sm" onClick={() => setShowAssignUserModal(true)}>
              <Icon name="add" className="mr-2" />
              Assign User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-[#93adc8]">
              {metadata?.accessPolicy === "all_users"
                ? "All users have access. Assign users here to grant elevated permissions."
                : "No users assigned. Assign users to grant access."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-700">
                  <tr className="text-left text-[#93adc8]">
                    <th className="pb-3 font-medium">User</th>
                    <th className="pb-3 font-medium">Access Level</th>
                    <th className="pb-3 font-medium">Expires</th>
                    <th className="pb-3 font-medium">Granted</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {users.map((user) => (
                    <tr key={user.userId} className="text-white">
                      <td className="py-3">
                        <div>
                          <div className="font-medium">{user.userName || "Unknown"}</div>
                          <div className="text-sm text-[#93adc8]">{user.userEmail}</div>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant="default">{user.accessLevel}</Badge>
                      </td>
                      <td className="py-3 text-[#93adc8]">
                        {user.expiresAt ? formatDate(user.expiresAt) : "Never"}
                      </td>
                      <td className="py-3 text-[#93adc8]">{formatDate(user.createdAt)}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(user)}
                          >
                            <Icon name="edit" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveUser(user.userId, user.userName)}
                          >
                            <Icon name="delete" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Groups Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>User Groups ({groups.length})</CardTitle>
            <Button size="sm" onClick={() => setShowCreateGroupModal(true)}>
              <Icon name="add" className="mr-2" />
              Create Group
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-8 text-[#93adc8]">
              No groups created. Create groups to manage access for multiple users.
            </div>
          ) : (
            <div className="grid gap-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <div>
                    <div className="font-medium text-white">{group.name}</div>
                    <div className="text-sm text-[#93adc8]">
                      {group.description || "No description"}
                    </div>
                    <div className="text-sm text-[#93adc8] mt-1">
                      {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Icon name="more_vert" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign User Modal */}
      <Modal
        isOpen={showAssignUserModal}
        onClose={() => {
          setShowAssignUserModal(false);
          setAssignUserId("");
          setAssignAccessLevel("use");
          setAssignExpiresInDays("");
        }}
        title="Assign User to Client"
      >
        <form onSubmit={handleAssignUser} className="space-y-4">
          <div>
            <Label htmlFor="userId">User</Label>
            <div className="flex gap-2">
              <Input
                id="userId"
                type="text"
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                placeholder="Select a user"
                required
                readOnly
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowUserPicker(true)}
              >
                <Icon name="search" />
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="accessLevel">Access Level</Label>
            <Select
              value={assignAccessLevel}
              onChange={(value) => setAssignAccessLevel(value as "use" | "admin")}
              options={ACCESS_LEVELS.map((level) => ({
                value: level.value,
                label: `${level.label} - ${level.description}`,
              }))}
              className="w-full"
            />
          </div>

          <div>
            <Label htmlFor="expiresInDays">Expires In (days, optional)</Label>
            <Input
              id="expiresInDays"
              type="number"
              min="1"
              value={assignExpiresInDays}
              onChange={(e) => setAssignExpiresInDays(e.target.value)}
              placeholder="Never expires"
            />
            <p className="text-sm text-[#93adc8] mt-1">
              Leave empty for permanent access
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAssignUserModal(false);
                setAssignUserId("");
                setAssignAccessLevel("use");
                setAssignExpiresInDays("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!assignUserId}>
              Assign User
            </Button>
          </div>
        </form>
      </Modal>

      {/* User Picker Modal */}
      <UserGroupPicker
        isOpen={showUserPicker}
        onClose={() => setShowUserPicker(false)}
        type="user"
        onSelect={(selected) => {
          const user = selected as User;
          setAssignUserId(user.id);
          setShowUserPicker(false);
        }}
        excludeIds={users.map((u) => u.userId)}
      />

      {/* Edit Access Modal */}
      <Modal
        isOpen={showEditAccessModal}
        onClose={() => setShowEditAccessModal(false)}
        title="Edit User Access"
      >
        <form onSubmit={handleEditAccess} className="space-y-4">
          <div>
            <Label>User</Label>
            <p className="text-white">{selectedUser?.userName || "Unknown"}</p>
            <p className="text-sm text-[#93adc8]">{selectedUser?.userEmail}</p>
          </div>

          <div>
            <Label htmlFor="editAccessLevel">Access Level</Label>
            <Select
              value={editAccessLevel}
              onChange={(value) => setEditAccessLevel(value as "use" | "admin")}
              options={ACCESS_LEVELS.map((level) => ({
                value: level.value,
                label: `${level.label} - ${level.description}`,
              }))}
              className="w-full"
            />
          </div>

          <div>
            <Label htmlFor="editExpiresInDays">Extend Expiration (days, optional)</Label>
            <Input
              id="editExpiresInDays"
              type="number"
              min="1"
              value={editExpiresInDays}
              onChange={(e) => setEditExpiresInDays(e.target.value)}
              placeholder="No change"
            />
            <p className="text-sm text-[#93adc8] mt-1">
              Current: {selectedUser?.expiresAt ? formatDate(selectedUser.expiresAt) : "Never"}
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowEditAccessModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Update Access
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Group Modal */}
      <Modal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        title="Create User Group"
      >
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div>
            <Label htmlFor="groupName">Group Name</Label>
            <Input
              id="groupName"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Engineering Team"
              required
            />
          </div>

          <div>
            <Label htmlFor="groupDescription">Description (optional)</Label>
            <Input
              id="groupDescription"
              type="text"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              placeholder="Team description"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateGroupModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Create Group
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
