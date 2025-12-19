"use client";

import { useState, useMemo, useCallback } from "react";
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
  Modal,
  type TabItem,
} from "@/components/ui";
import {
  FormWrapper,
  SubmitButton,
} from "@/components/forms";
import { PageHeading } from "@/components/layout";
import { Alert } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/time";
import {
  updateWebhook,
  deleteWebhook,
  regenerateSecret,
  type WebhookFormState,
} from "../actions";
import type { WebhookEndpointWithSubscriptions, WebhookDeliveryEntity } from "@/lib/types";
import { WebhookFormContent } from "./webhook-form-content";
import { toast } from "@/lib/toast";
import { webhookSchema } from "@/schemas/webhooks";

interface EditWebhookClientProps {
  webhook: WebhookEndpointWithSubscriptions;
  deliveryHistory: WebhookDeliveryEntity[];
}

export function EditWebhookClient({ webhook, deliveryHistory }: EditWebhookClientProps) {
  const router = useRouter();
  const [regeneratedSecret, setRegeneratedSecret] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Prepare default values from webhook data - memoized to prevent infinite loops
  const defaultValues = useMemo(() => ({
    displayName: webhook.displayName || "",
    url: webhook.url || "", // Convert null to empty string for form
    isActive: webhook.isActive,
    eventTypes: webhook.subscriptions.map((sub) => sub.eventType),
    retryPolicy: webhook.retryPolicy as "none" | "standard" | "aggressive",
    deliveryFormat: webhook.deliveryFormat,
    requestMethod: webhook.requestMethod,
  }), [
    webhook.displayName,
    webhook.url,
    webhook.isActive,
    webhook.subscriptions,
    webhook.retryPolicy,
    webhook.deliveryFormat,
    webhook.requestMethod,
  ]);

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

  // Memoize handleSuccess to prevent infinite re-renders
  const handleSuccess = useCallback(() => {
    toast.success("Webhook updated", "Your webhook settings have been saved successfully.");
    router.refresh();
  }, [router]);

  const handleRegenerateSecret = async () => {
    const result = await regenerateSecret(webhook.id);
    if (result.success && result.secret) {
      setRegeneratedSecret(result.secret);
      toast.success("Secret regenerated", "Your new webhook secret has been generated. Make sure to copy it now.");
    } else {
      toast.error("Failed to regenerate secret", result.error);
    }
  };

  const handleDelete = async () => {
    setShowDeleteModal(false);
    const result = await deleteWebhook(webhook.id);
    if (result.success) {
      toast.success("Webhook deleted", "The webhook endpoint has been deleted.");
      router.push("/admin/webhooks");
    } else {
      toast.error("Failed to delete webhook", result.error);
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
                schema={webhookSchema}
                action={handleSubmitWrapper}
                onSuccess={handleSuccess}
                defaultValues={defaultValues}
                resetOnSuccess={false}
              >
                <WebhookFormContent />

                {/* Form Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-between pt-6 mt-6 border-t border-gray-700">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setShowDeleteModal(true)}
                  >
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
        description={webhook.url || "No URL configured yet"}
      />

      <Tabs tabs={tabs} defaultIndex={0} />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Webhook?"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This action cannot be undone. This webhook endpoint and all its delivery history will be permanently deleted.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
            >
              Delete Webhook
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
