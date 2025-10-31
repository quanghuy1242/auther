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

export function WebhookFormContent() {
  const form = useFormContext();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const retryPolicyOptions = [
    { value: "standard", label: "Standard (3 retries)" },
    { value: "aggressive", label: "Aggressive (5 retries)" },
    { value: "none", label: "No Retries" },
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
        </div>
      </details>
    </div>
  );
}
