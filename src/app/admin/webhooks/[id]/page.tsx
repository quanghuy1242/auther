"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import {
  Card,
  CardContent,
  Button,
  WebhookSecretField,
  Badge,
  Icon,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Tabs,
  type TabItem,
} from "@/components/ui";
import {
  FormWrapper,
  FormField,
  SubmitButton,
  ControlledCheckbox,
  ControlledSelect,
  EventSelector,
} from "@/components/forms";
import { Alert, PageHeading } from "@/components/layout";
import { z } from "zod";
import {
  WEBHOOK_EVENT_TYPES,
  getWebhookById,
  getMockDeliveryHistory,
  formatRelativeTime,
} from "@/lib/mock-data/webhooks";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";

// Form schema (same as create)
const updateWebhookSchema = z.object({
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
          label="Enable webhook"
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
      <details
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
        className="group"
      >
        <summary className="flex items-center gap-2 cursor-pointer text-[var(--color-text-primary)] hover:text-[var(--color-primary)] transition-colors font-medium select-none">
          <Icon
            name="expand_more"
            className="!text-xl group-open:rotate-180 transition-transform"
          />
          Advanced Options
        </summary>

        <div className="mt-4 space-y-6 pl-7">
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
        </div>
      </details>
    </div>
  );
}

export default function EditWebhookPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [regeneratedSecret, setRegeneratedSecret] = useState<string | null>(null);
  
  // Get webhook data
  const webhook = getWebhookById(resolvedParams.id);
  const deliveryHistory = getMockDeliveryHistory(resolvedParams.id);

  if (!webhook) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Icon name="error" className="text-red-500 text-4xl mb-4" />
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
              Webhook Not Found
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-6">
              The webhook you&apos;re looking for doesn&apos;t exist or has been deleted.
            </p>
            <Link href="/admin/webhooks">
              <Button variant="primary">Back to Webhooks</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _prevState: FormState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _formData: FormData
  ): Promise<FormState> => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { success: true, data: { updated: true } };
  };

  const handleSuccess = () => {
    alert("Webhook updated successfully!");
  };

  const handleRegenerateSecret = () => {
    const newSecret = `whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    setRegeneratedSecret(newSecret);
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this webhook? This action cannot be undone.")) {
      alert("Webhook deleted (mock action)");
      router.push("/admin/webhooks");
    }
  };

  // Tabs for Settings and Delivery Logs
  const tabs: TabItem[] = [
    {
      label: "Settings",
      content: (
        <div className="space-y-6">
          {/* Secret Section */}
          <Card>
            <CardContent>
              <Alert variant="warning" className="mb-4" title="Secret">This is your webhook secret. Keep it safe!</Alert>
              <WebhookSecretField
                secret={regeneratedSecret || `whsec_••••••••••••••••${webhook.secret.slice(-6)}`}
                isNewSecret={!!regeneratedSecret}
                onRegenerate={handleRegenerateSecret}
              />
            </CardContent>
          </Card>

          {/* Settings Form */}
          <Card>
            <CardContent>
              <FormWrapper
                schema={updateWebhookSchema}
                action={handleSubmit}
                onSuccess={handleSuccess}
              >
                <WebhookFormContent />

                {/* Form Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-between pt-6 mt-6 border-t border-gray-700">
                  <Button type="button" variant="danger" onClick={handleDelete}>
                    Delete Webhook
                  </Button>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button type="button" variant="ghost" onClick={() => router.back()}>
                      Cancel
                    </Button>
                    <SubmitButton>Save Changes</SubmitButton>
                  </div>
                </div>
              </FormWrapper>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      label: "Delivery Logs",
      content: (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                Recent Deliveries
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Last 25 webhook delivery attempts
              </p>
            </div>

            {/* Delivery Logs Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Attempts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryHistory.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <code className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-content)] px-2 py-1 rounded">
                          {delivery.eventType}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={delivery.status === "success" ? "success" : "danger"}
                          dot
                        >
                          {delivery.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {formatRelativeTime(delivery.timestamp)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {delivery.responseCode ? (
                          <span
                            className={cn(
                              "text-sm font-mono",
                              delivery.status === "success"
                                ? "text-green-500"
                                : "text-red-500"
                            )}
                          >
                            {delivery.responseCode}
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--color-text-tertiary)]">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {delivery.durationMs ? (
                          <span className="text-sm text-[var(--color-text-secondary)]">
                            {delivery.durationMs}ms
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--color-text-tertiary)]">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {delivery.attemptCount}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <PageHeading
        title={webhook.displayName || "Edit Webhook"}
        description={webhook.url}
      />

      <Tabs tabs={tabs} defaultIndex={0} />
    </div>
  );
}

// Import 'use' from React
import { use } from "react";
