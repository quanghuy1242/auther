"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  SubmitButton,
} from "@/components/forms";
import { Alert, PageHeading } from "@/components/layout";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/time";
import {
  updateWebhook,
  deleteWebhook,
  regenerateSecret,
  type WebhookFormState,
} from "../actions";
import type { WebhookEndpointWithSubscriptions, WebhookDeliveryEntity } from "@/lib/types";
import { z } from "zod";
import { WebhookFormContent } from "./webhook-form-content";

// Form schema matching backend implementation
const updateWebhookSchema = z.object({
  displayName: z.string().optional(),
  url: z.string().url("Please enter a valid URL"),
  isActive: z.boolean().default(true),
  events: z.array(z.string()).min(1, "Please select at least one event"),
  retryPolicy: z.enum(["none", "standard", "aggressive"]).default("standard"),
});

interface EditWebhookClientProps {
  webhook: WebhookEndpointWithSubscriptions;
  deliveryHistory: WebhookDeliveryEntity[];
}

export function EditWebhookClient({ webhook, deliveryHistory }: EditWebhookClientProps) {
  const router = useRouter();
  const [regeneratedSecret, setRegeneratedSecret] = useState<string | null>(null);

  const handleSubmit = async (
    prevState: WebhookFormState,
    formData: FormData
  ): Promise<WebhookFormState> => {
    return await updateWebhook(webhook.id, prevState, formData);
  };

  const handleSubmitWrapper = async (
    prevState: unknown,
    formData: FormData
  ) => {
    return await handleSubmit(prevState as WebhookFormState, formData);
  };

  const handleSuccess = () => {
    router.refresh();
  };

  const handleRegenerateSecret = async () => {
    const result = await regenerateSecret(webhook.id);
    if (result.success && result.secret) {
      setRegeneratedSecret(result.secret);
    }
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this webhook? This action cannot be undone.")) {
      const result = await deleteWebhook(webhook.id);
      if (result.success) {
        router.push("/admin/webhooks");
      }
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
              <Alert variant="warning" className="mb-4" title="Secret">
                This is your webhook secret. Keep it safe!
              </Alert>
              <WebhookSecretField
                secret={regeneratedSecret || `whsec_••••••••••••••••${webhook.id.toString().slice(-6)}`}
                isNewSecret={!!regeneratedSecret}
                readOnly={!regeneratedSecret}
                onRegenerate={handleRegenerateSecret}
              />
            </CardContent>
          </Card>

          {/* Settings Form */}
          <Card>
            <CardContent>
              <FormWrapper
                schema={updateWebhookSchema}
                action={handleSubmitWrapper}
                onSuccess={handleSuccess}
              >
                <WebhookFormContent />

                {/* Form Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-between pt-6 mt-6 border-t border-gray-700">
                  <Button type="button" variant="danger" size="sm" onClick={handleDelete}>
                    Delete Webhook
                  </Button>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
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

            {deliveryHistory.length === 0 ? (
              <div className="text-center py-12">
                <Icon name="history" className="text-4xl text-[var(--color-text-tertiary)] mb-4" />
                <p className="text-[var(--color-text-secondary)]">No delivery history yet</p>
              </div>
            ) : (
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
                            Event #{delivery.eventId.slice(-6)}
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
                            {formatRelativeTime(delivery.lastAttemptAt || delivery.createdAt)}
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
            )}
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
