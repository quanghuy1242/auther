"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@/components/ui";
import { updateUserProfile, type UpdateUserState, type UserDetail } from "../actions";
import { toast } from "@/lib/toast";
import { UserFormFields, SystemInfoCard } from "@/components/admin/users";

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

      <div className="space-y-6">
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
