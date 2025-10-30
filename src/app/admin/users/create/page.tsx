"use client";

import * as React from "react";
import { z } from "zod";
import { useWatch } from "react-hook-form";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, Button } from "@/components/ui";
import { FormWrapper, FormField, ControlledCheckbox, SubmitButton } from "@/components/forms";
import { createUser } from "./actions";
import { useRouter } from "next/navigation";

const createUserSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  username: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  sendInvite: z.boolean().optional(),
});

function CreateUserForm() {
  const sendInvite = useWatch({ name: "sendInvite", defaultValue: false });

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FormField
            name="username"
            label="Username (Optional)"
            placeholder="johndoe"
          />
          <p className="text-sm text-gray-400 mt-1">Leave empty to use email for login</p>
        </div>
        <div>
          <FormField
            name="password"
            label="Password (Optional)"
            type="password"
            placeholder="••••••••"
            disabled={sendInvite}
          />
          <p className="text-sm text-gray-400 mt-1">
            {sendInvite ? "User will set password via email" : "Leave empty to generate temporary password"}
          </p>
        </div>
      </div>

      <ControlledCheckbox
        name="sendInvite"
        label="Send invitation email"
        description="Send a verification email. User must verify email and set password to log in."
      />

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => window.history.back()}
        >
          Cancel
        </Button>
        <SubmitButton variant="primary" leftIcon="add">
          Create User Account
        </SubmitButton>
      </div>
    </div>
  );
}

export default function CreateUserPage() {
  const router = useRouter();
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [sendInvite, setSendInvite] = React.useState(false);

  const handleSuccess = (data: unknown) => {
    setShowSuccess(true);
    const result = data as { userId: string; email: string } | undefined;
    // Check if sendInvite was true from the data
    if (result) {
      setSendInvite(true);
    }
    setTimeout(() => {
      router.push("/admin/users");
    }, 2000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeading
        title="Create New User"
        description="Add a new user account to the system"
      />

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
                <p className="text-sm text-gray-400">
                  {sendInvite 
                    ? "Verification email sent. The user will need to verify their email and set a password."
                    : "Redirecting to user list..."}
                </p>
              </div>
            ) : (
              <FormWrapper
                schema={createUserSchema}
                action={createUser}
                onSuccess={handleSuccess}
                className="space-y-6"
              >
                <CreateUserForm />
              </FormWrapper>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
