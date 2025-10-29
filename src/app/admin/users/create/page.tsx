"use client";

import * as React from "react";
import { z } from "zod";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, Button } from "@/components/ui";
import { FormWrapper, FormField, ControlledSelect, ControlledCheckbox, SubmitButton } from "@/components/forms";
import { createUser } from "./actions";
import { useRouter } from "next/navigation";

const createUserSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["viewer", "editor", "admin"], "Please select a role"),
  sendWelcomeEmail: z.boolean().optional(),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export default function CreateUserPage() {
  const router = useRouter();
  const [showSuccess, setShowSuccess] = React.useState(false);

  const handleSuccess = (data: any) => {
    setShowSuccess(true);
    setTimeout(() => {
      router.push("/admin/users");
    }, 2000);
  };

  return (
    <>
      <PageHeading
        title="Create New User"
        description="Add a new user account to the system"
      />

      <div className="max-w-2xl">
        <Card>
          <CardContent className="pt-6">
            {showSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-green-500 text-[32px]">
                    check_circle
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">User Created Successfully!</h3>
                <p className="text-sm text-gray-400">Redirecting to user list...</p>
              </div>
            ) : (
              <FormWrapper
                schema={createUserSchema}
                action={createUser}
                onSuccess={handleSuccess}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    name="fullName"
                    label="Full Name"
                    placeholder="John Doe"
                    required
                  />
                  <FormField
                    name="email"
                    label="Email Address"
                    type="email"
                    placeholder="john.doe@example.com"
                    required
                  />
                </div>

                <ControlledSelect
                  name="role"
                  label="User Role"
                  placeholder="Select a role"
                  required
                  options={[
                    { value: "viewer", label: "Viewer - Read-only access" },
                    { value: "editor", label: "Editor - Can modify content" },
                    { value: "admin", label: "Admin - Full access" },
                  ]}
                />

                <ControlledCheckbox
                  name="sendWelcomeEmail"
                  label="Send welcome email"
                  description="Send an email with login instructions to the new user"
                />

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.back()}
                  >
                    Cancel
                  </Button>
                  <SubmitButton variant="primary" leftIcon="add">
                    Create User Account
                  </SubmitButton>
                </div>
              </FormWrapper>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
