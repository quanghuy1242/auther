"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { Card, CardContent, Button, WebhookSecretField } from "@/components/ui";
import {
  FormWrapper,
  SubmitButton,
} from "@/components/forms";
import { PageHeading } from "@/components/layout";
import { Icon } from "@/components/ui";
import { createWebhook } from "../actions";
import { webhookSchema } from "../shared";
import { WebhookFormContent } from "../[id]/webhook-form-content";

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
            schema={webhookSchema}
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
