"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label } from "@/components/ui";
import { updateUserProfile, type UpdateUserState, type UserDetail } from "../actions";
import { toast } from "@/lib/toast";
import { formatDateShort, formatDate } from "@/lib/utils/date-formatter";
import { Badge } from "@/components/ui";
import { CopyableInput } from "@/components/ui";

interface UserProfileTabProps {
  user: UserDetail;
}

export function UserProfileTab({ user }: UserProfileTabProps) {
  const [isEditing, setIsEditing] = React.useState(false);

  const updateWithUserId = updateUserProfile.bind(null, user.id);
  const [profileState, profileAction] = useFormState<UpdateUserState, FormData>(
    updateWithUserId,
    { success: false }
  );

  React.useEffect(() => {
    if (profileState?.success) {
      setIsEditing(false);
      toast.success("Profile updated", "User profile has been updated successfully.");
    } else if (profileState?.error) {
      toast.error("Update failed", profileState.error);
    }
  }, [profileState]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>User Details</CardTitle>
              <Button
                variant={isEditing ? "secondary" : "primary"}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? "Cancel" : "Edit"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <form action={profileAction} className="space-y-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={user.name}
                    required
                  />
                  {profileState.errors?.name && (
                    <p className="text-sm text-red-500 mt-1">{profileState.errors.name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    defaultValue={user.username || ""}
                  />
                  {profileState.errors?.username && (
                    <p className="text-sm text-red-500 mt-1">{profileState.errors.username}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="displayUsername">Display Username</Label>
                  <Input
                    id="displayUsername"
                    name="displayUsername"
                    defaultValue={user.displayUsername || ""}
                  />
                  {profileState.errors?.displayUsername && (
                    <p className="text-sm text-red-500 mt-1">{profileState.errors.displayUsername}</p>
                  )}
                </div>
                <Button type="submit" variant="primary" size="sm">
                  Save Changes
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-400">Full Name</Label>
                  <p className="text-base text-white mt-1">{user.name}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Email</Label>
                  <p className="text-base text-white mt-1">{user.email}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Username</Label>
                  <p className="text-base text-white mt-1">{user.username || "—"}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Display Username</Label>
                  <p className="text-base text-white mt-1">{user.displayUsername || "—"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <CopyableInput
                label="User ID"
                value={user.id}
                labelClassName="text-gray-400"
                className="font-mono text-sm bg-input border-slate-700 text-white pr-10"
              />
              <div>
                <Label className="text-gray-400">Created</Label>
                <p className="text-base text-white mt-1">
                  {formatDateShort(user.createdAt)}
                </p>
              </div>
              <div>
                <Label className="text-gray-400">Last Updated</Label>
                <p className="text-base text-white mt-1">
                  {formatDateShort(user.updatedAt)}
                </p>
              </div>
              <div>
                <Label className="text-gray-400">Email Status</Label>
                <div className="mt-1">
                  <Badge variant={user.emailVerified ? "success" : "warning"}>
                    {user.emailVerified ? "Verified" : "Unverified"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
