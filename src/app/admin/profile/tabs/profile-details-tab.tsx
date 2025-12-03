"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label, CopyableInput, Badge } from "@/components/ui";
import { updateProfile, type UpdateProfileState } from "../actions";
import type { SessionUser } from "@/lib/session";
import { formatDateShort } from "@/lib/utils/date-formatter";
import { toast } from "@/lib/toast";

interface ProfileDetailsTabProps {
  user: SessionUser;
}

export function ProfileDetailsTab({ user }: ProfileDetailsTabProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  
  const [profileState, profileAction] = useFormState<UpdateProfileState, FormData>(
    updateProfile,
    { success: false }
  );

  React.useEffect(() => {
    if (profileState.success) {
      setIsEditing(false);
      toast.success("Profile updated successfully!", "Your changes have been saved.");
    } else if (profileState.error) {
      toast.error("Failed to update profile", profileState.error);
    }
  }, [profileState.success, profileState.error]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6">
      <div className="md:col-span-2 space-y-8">
        {/* User Details Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>User Details</CardTitle>
              <Button
                variant="ghost"
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
                    error={profileState.errors?.name}
                  />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    defaultValue={user.username || ""}
                    placeholder="Optional"
                    error={profileState.errors?.username}
                  />
                </div>
                <div>
                  <Label htmlFor="displayUsername">Display Username</Label>
                  <Input
                    id="displayUsername"
                    name="displayUsername"
                    defaultValue={user.displayUsername || ""}
                    placeholder="Optional"
                    error={profileState.errors?.displayUsername}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    value={user.email}
                    disabled
                    className="opacity-50"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Email cannot be changed
                  </p>
                </div>
                <Button type="submit" variant="primary" size="sm">
                  Save Changes
                </Button>
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <Label className="text-gray-400">Full Name</Label>
                  <p className="text-base text-white mt-1">{user.name}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Email Address</Label>
                  <p className="text-base text-white mt-1">{user.email}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Username</Label>
                  <p className="text-base text-white mt-1">{user.username || "Not set"}</p>
                </div>
                <div>
                  <Label className="text-gray-400">Display Username</Label>
                  <p className="text-base text-white mt-1">
                    {user.displayUsername || "Not set"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="md:col-span-1">
        {/* System Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-gray-400 mb-1 block">User ID</Label>
                <CopyableInput value={user.id} readOnly />
              </div>
              <div>
                <Label className="text-gray-400">Date Joined</Label>
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
