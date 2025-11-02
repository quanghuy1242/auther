"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { Card, CardContent, Button, WebhookSecretField } from "@/components/ui";
import {
  FormWrapper,
  FormField,
  SubmitButton,
  ControlledCheckbox,
  ControlledSelect,
  EventSelector,
} from "@/components/forms";
import { PageHeading } from "@/components/layout";
import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "@/lib/constants";
import { Icon } from "@/components/ui";
import { createWebhook } from "../actions";

// Form schema
const createWebhookSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  url: z.string().url("Please enter a valid URL").refine(
    (url) => {
      // Allow HTTPS, localhost, Docker network URLs, and local IPs
      return (
        url.startsWith("https://") || 
        url.startsWith("http://localhost") ||
        url.startsWith("http://127.0.0.1") ||
        /^http:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*:[0-9]+/.test(url)
      );
    },
    "URL must use HTTPS or be a valid local/Docker network URL"
  ),
  isActive: z.boolean().default(true),
  eventTypes: z.array(z.string()).min(1, "Please select at least one event"),
  retryPolicy: z.enum(["none", "standard", "aggressive"]).default("standard"),
  deliveryFormat: z.enum(["json", "form-encoded"]).default("json"),
  requestMethod: z.enum(["POST", "PUT"]).default("POST"),
});

// Form content component
function WebhookFormContent() {
  const form = useFormContext();

  // Dropdown options
  const retryPolicyOptions = [
    { value: "none", label: "No Retries" },
    { value: "standard", label: "Standard (3 retries)" },
    { value: "aggressive", label: "Aggressive (5 retries)" },
  ];

  const deliveryFormatOptions = [
    { value: "json", label: "JSON" },
    { value: "form-encoded", label: "Form-encoded" },
  ];

  const requestMethodOptions = [
    { value: "POST", label: "POST" },
    { value: "PUT", label: "PUT" },
  ];

  return (
    <div className="space-y-6">
      {/* Basic Configuration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          name="displayName"
          label="Display Name"
          placeholder="My Production Webhook"
          required
          helperText="Friendly name for this webhook"
        />
        <FormField
          name="url"
          label="Webhook URL"
          placeholder="https://api.example.com/webhook-receiver"
          required
          helperText="The endpoint that will receive webhook events"
        />
      </div>

      {/* Status Toggle */}
      <div 
        className="flex items-start gap-3 p-4 rounded-lg border border-white/10"
        style={{ backgroundColor: '#1a2632' }}
      >
        <ControlledCheckbox
          name="isActive"
          label="Enable webhook immediately"
          description="Toggle to activate or deactivate this webhook endpoint"
        />
      </div>

      {/* Event Subscriptions */}
      <EventSelector
        name="eventTypes"
        control={form.control}
        events={WEBHOOK_EVENT_TYPES.map((e) => ({
          value: e.value,
          label: e.label,
          description: e.description,
        }))}
        label="Event Subscriptions"
      />

      {/* Advanced Options */}
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer text-[var(--color-text-primary)] hover:text-[var(--color-primary)] transition-colors font-medium select-none">
          <Icon
            name="expand_more"
            className="text-xl! group-open:rotate-180 transition-transform"
          />
          Advanced Options
        </summary>

        <div className="mt-4 space-y-6 pl-7">
          {/* Retry Policy, Delivery Format, Request Method */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Retry Policy
              </label>
              <ControlledSelect
                name="retryPolicy"
                options={retryPolicyOptions}
                placeholder="Select retry policy"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Delivery Format
              </label>
              <ControlledSelect
                name="deliveryFormat"
                options={deliveryFormatOptions}
                placeholder="Select format"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Request Method
              </label>
              <ControlledSelect
                name="requestMethod"
                options={requestMethodOptions}
                placeholder="Select method"
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}


export default function CreateWebhookPage() {
  const router = useRouter();
  const [createdWebhook, setCreatedWebhook] = useState<{ id: string; secret: string } | null>(
    null
  );

  // Define default values that match the schema defaults
  const defaultValues = {
    displayName: "",
    url: "",
    isActive: true,
    eventTypes: [] as string[],
    retryPolicy: "standard" as const,
    deliveryFormat: "json" as const,
    requestMethod: "POST" as const,
  };

  const handleSubmit = async (prevState: unknown, formData: FormData) => {
    return await createWebhook(prevState as Parameters<typeof createWebhook>[0], formData);
  };

  const handleSuccess = (data: unknown) => {
    const result = data as { id: string; secret?: string };
    if (result.id && result.secret) {
      setCreatedWebhook({ id: result.id, secret: result.secret });
    }
  };

  const handleDone = () => {
    router.push("/admin/webhooks");
  };

  // If webhook was created, show success screen with secret
  if (createdWebhook) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <PageHeading title="Webhook Created Successfully" />

        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <Icon name="check_circle" className="text-green-500 text-2xl shrink-0" />
              <div>
                <p className="font-medium text-green-500 mb-1">Webhook endpoint created</p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Your webhook has been created and is ready to receive events. Save your secret now
                  - you won&apos;t be able to see it again.
                </p>
              </div>
            </div>

            <WebhookSecretField secret={createdWebhook.secret} isNewSecret />

            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
              <Button variant="secondary" size="sm" onClick={() => router.push(`/admin/webhooks/${createdWebhook.id}`)}>
                Edit Webhook
              </Button>
              <Button variant="primary" size="sm" onClick={handleDone}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <PageHeading
        title="Create Webhook"
        description="Configure a new webhook endpoint to receive real-time event notifications"
      />

      <Card>
        <CardContent>
          <FormWrapper
            schema={createWebhookSchema}
            action={handleSubmit}
            onSuccess={handleSuccess}
            defaultValues={defaultValues}
          >
            <WebhookFormContent />

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-6 mt-6 border-t border-gray-700">
              <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
                Cancel
              </Button>
              <SubmitButton>Create Webhook</SubmitButton>
            </div>
          </FormWrapper>
        </CardContent>
      </Card>
    </div>
  );
}
