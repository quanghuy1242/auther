"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@/components/ui";
import { updateProfile, type UpdateProfileState } from "../actions";
import type { SessionUser } from "@/lib/session";
import { toast } from "@/lib/toast";
import { UserFormFields, SystemInfoCard } from "@/components/admin/users";

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
            <form action={profileAction}>
              <UserFormFields
                defaultValues={{
                  name: user.name,
                  email: user.email,
                  username: user.username,
                  displayUsername: user.displayUsername,
                }}
                errors={profileState.errors}
                isEditing={isEditing}
              />
              
              {isEditing && (
                <div className="mt-4">
                  <Button type="submit" variant="primary" size="sm">
                    Save Changes
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="md:col-span-1">
        <SystemInfoCard
          id={user.id}
          createdAt={user.createdAt}
          updatedAt={user.updatedAt}
          emailVerified={user.emailVerified}
        />
      </div>
    </div>
  );
}
