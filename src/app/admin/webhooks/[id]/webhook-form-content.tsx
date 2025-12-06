"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Icon } from "@/components/ui";
import {
  FormField,
  ControlledCheckbox,
  ControlledSelect,
  EventSelector,
} from "@/components/forms";
import { WEBHOOK_EVENT_TYPES } from "@/lib/constants";
import { 
  RETRY_POLICY_OPTIONS, 
  DELIVERY_FORMAT_OPTIONS, 
  REQUEST_METHOD_OPTIONS 
} from "@/schemas/webhooks";

export function WebhookFormContent() {
  const form = useFormContext();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-6">
      {/* Basic Configuration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          name="displayName"
          label="Display Name"
          placeholder="My Production Webhook"
          helperText="Friendly name for this webhook"
          required
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
                options={RETRY_POLICY_OPTIONS}
                placeholder="Select retry policy"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Delivery Format
              </label>
              <ControlledSelect
                name="deliveryFormat"
                options={DELIVERY_FORMAT_OPTIONS}
                placeholder="Select delivery format"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Request Method
              </label>
              <ControlledSelect
                name="requestMethod"
                options={REQUEST_METHOD_OPTIONS}
                placeholder="Select request method"
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
