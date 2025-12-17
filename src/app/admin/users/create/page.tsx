"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, Button, Badge, Label, Select } from "@/components/ui";
import { FormWrapper, FormField, ControlledCheckbox, SubmitButton } from "@/components/forms";
import { createUser, type CreateUserState } from "./actions";
import { useRouter } from "next/navigation";
import { createUserSchema } from "@/schemas/users";
import { getPolicyTemplates } from "../[id]/permissions-actions";
import { getAvailableContexts } from "../invites-actions";
import type { PolicyTemplate } from "@/lib/repositories/platform-access-repository";
import type { RegistrationContext } from "../invites-actions";

interface CreateUserFormProps {
  onCancel: () => void;
  templates: PolicyTemplate[];
  contexts: RegistrationContext[];
}

function CreateUserForm({ onCancel, templates, contexts }: CreateUserFormProps) {
  const { watch, setValue } = useFormContext();
  const sendInvite = watch("sendInvite", false);
  const selectedTemplateId = watch("templateId", "");
  const selectedContextSlug = watch("contextSlug", "");

  // Clear password when sendInvite is toggled on
  React.useEffect(() => {
    if (sendInvite) {
      setValue("password", "");
    }
  }, [sendInvite, setValue]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-400 mb-3">User Information</h3>
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
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
              readOnly={sendInvite}
              autoComplete="new-password"
            />
            <p className="text-sm text-gray-400 mt-1">
              {sendInvite ? "User will set password via email" : "Leave empty to generate temporary password"}
            </p>
          </div>
        </div>
      </div>

      {/* Permissions Section */}
      <div className="border-t border-neutral-700 pt-6">
        <h3 className="text-sm font-semibold text-neutral-400 mb-3">Initial Permissions</h3>

        {/* Template Selector */}
        <div className="space-y-2 mb-4">
          <Label>Policy Template</Label>
          <Select
            value={selectedTemplateId}
            onChange={(v) => setValue("templateId", v)}
            options={[
              { value: "", label: "No template (no permissions)" },
              ...templates.map(t => ({
                value: t.id,
                label: `${t.name}${t.isSystem ? " (System)" : ""}`,
              })),
            ]}
          />
          {selectedTemplate && (
            <div className="mt-2 p-3 bg-neutral-800 rounded-lg">
              {selectedTemplate.description && (
                <p className="text-sm text-neutral-400 mb-2">{selectedTemplate.description}</p>
              )}
              <div className="flex flex-wrap gap-1">
                {selectedTemplate.permissions.map((p, i) => (
                  <Badge key={i} variant="default" className="text-xs font-mono">
                    {p.entityType || "platform"}:{p.relation}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Registration Context (for invite flow) */}
        {contexts.length > 0 && (
          <div className="space-y-2">
            <Label>Registration Context (Optional)</Label>
            <Select
              value={selectedContextSlug}
              onChange={(v) => setValue("contextSlug", v)}
              options={[
                { value: "", label: "None" },
                ...contexts.map(c => ({
                  value: c.slug,
                  label: c.name,
                })),
              ]}
            />
            <p className="text-xs text-neutral-500">
              Associates user with a registration context for tracking
            </p>
          </div>
        )}
      </div>

      {/* Invite Options */}
      <div className="border-t border-neutral-700 pt-6">
        <ControlledCheckbox
          name="sendInvite"
          label="Send invitation email"
          description="Send a verification email. User must verify email and set password to log in."
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
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
  const [templates, setTemplates] = React.useState<PolicyTemplate[]>([]);
  const [contexts, setContexts] = React.useState<RegistrationContext[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Load templates and contexts
  React.useEffect(() => {
    async function load() {
      try {
        const [tmpls, ctxs] = await Promise.all([
          getPolicyTemplates(),
          getAvailableContexts(),
        ]);
        setTemplates(tmpls);
        setContexts(ctxs);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSuccess = (data: unknown) => {
    const result = data as CreateUserState["data"];
    setShowSuccess(true);
    setSendInvite(Boolean(result?.sendInvite));
    setTimeout(() => {
      router.push("/admin/users");
    }, 2000);
  };

  const handleCancel = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeading
          title="Create New User"
          description="Add a new user account to the system"
        />
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-neutral-500">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
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
              // @ts-expect-error - Zod version mismatch with react-hook-form resolver
              action={createUser}
              onSuccess={handleSuccess}
              className="space-y-6"
            >
              <CreateUserForm
                onCancel={handleCancel}
                templates={templates}
                contexts={contexts}
              />
            </FormWrapper>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
