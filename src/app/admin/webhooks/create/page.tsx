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
import { WEBHOOK_EVENT_TYPES } from "@/lib/mock-data/webhooks";
import { Icon } from "@/components/ui";

// Form schema
const createWebhookSchema = z.object({
  displayName: z.string().optional(),
  url: z.string().url("Please enter a valid URL"),
  isActive: z.boolean().default(true),
  events: z.array(z.string()).min(1, "Please select at least one event"),
  retryPolicy: z.enum(["exponential", "linear", "none"]).default("exponential"),
  deliveryFormat: z.enum(["json", "form-encoded"]).default("json"),
  requestMethod: z.enum(["POST", "PUT"]).default("POST"),
  customPayloadTemplate: z.string().optional(),
  emailNotifications: z.boolean().default(false),
  slackNotifications: z.boolean().default(false),
});

interface FormState {
  success: boolean;
  data?: unknown;
  errors?: Record<string, string>;
}

// Form content component
function WebhookFormContent() {
  const form = useFormContext();

  // Dropdown options
  const retryPolicyOptions = [
    { value: "exponential", label: "Exponential Backoff" },
    { value: "linear", label: "Linear Retry" },
    { value: "none", label: "No Retries" },
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
          helperText="Optional friendly name for this webhook"
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
        name="events"
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
            className="!text-xl group-open:rotate-180 transition-transform"
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

          {/* Custom Payload Template */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Custom Payload Template
            </label>
            <p className="text-sm text-[var(--color-text-secondary)] mb-3">
              Define your own payload structure using placeholders like <code className="px-1.5 py-0.5 rounded bg-[var(--color-content)] text-xs">{`{{order.id}}`}</code> or <code className="px-1.5 py-0.5 rounded bg-[var(--color-content)] text-xs">{`{{user.email}}`}</code>
            </p>
            <FormField
              name="customPayloadTemplate"
              multiline
              rows={6}
              placeholder={`{
  "event_type": "{{event.type}}",
  "order_id": "{{order.id}}",
  "customer_email": "{{order.customer.email}}"
}`}
              className="font-mono text-sm"
            />
          </div>

          {/* Error Notifications */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-3">
              Error Notifications
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div 
                className="p-4 rounded-lg border border-white/10"
                style={{ backgroundColor: '#1a2632' }}
              >
                <ControlledCheckbox
                  name="emailNotifications"
                  label="Email Notifications"
                  description="Receive email alerts for failed deliveries"
                />
              </div>
              <div 
                className="p-4 rounded-lg border border-white/10"
                style={{ backgroundColor: '#1a2632' }}
              >
                <ControlledCheckbox
                  name="slackNotifications"
                  label="Slack Notifications"
                  description="Send alerts to your Slack workspace"
                />
              </div>
            </div>
          </div>

          {/* Send Sample Payload (Future Feature) */}
          <div 
            className="p-4 rounded-lg border border-white/10"
            style={{ backgroundColor: '#1a2632' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Test Webhook
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  Send a sample payload to verify your endpoint is working correctly
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => alert("Test webhook feature coming soon!")}
                disabled
              >
                Send Test
              </Button>
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

  const handleSubmit = async (
    // Required for server action signature
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _prevState: FormState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _formData: FormData
  ): Promise<FormState> => {
    // Mock delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock success - generate a mock webhook
    const mockWebhook = {
      id: `wh_${Math.random().toString(36).substring(7)}`,
      secret: `whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
    };

    return {
      success: true,
      data: mockWebhook,
    };
  };

  const handleSuccess = (data: unknown) => {
    const result = data as { id: string; secret: string };
    setCreatedWebhook(result);
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
              <Button variant="secondary" onClick={() => router.push(`/admin/webhooks/${createdWebhook.id}`)}>
                Edit Webhook
              </Button>
              <Button variant="primary" onClick={handleDone}>
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
          >
            <WebhookFormContent />

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-6 mt-6 border-t border-gray-700">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
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
