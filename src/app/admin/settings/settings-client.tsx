"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Checkbox, CopyableInput, UrlListBuilder } from "@/components/ui";
import { SecretStatusRow } from "@/components/admin";
import type { SettingsData } from "./types";

interface SettingsClientProps {
  initialData: SettingsData;
}

export function SettingsClient({ initialData }: SettingsClientProps) {
  // Feature flags state
  const [allowDynamicClientRegistration, setAllowDynamicClientRegistration] = React.useState(
    initialData.featureFlags.allowDynamicClientRegistration
  );

  // JWT Audiences state
  const [jwtAudiences, setJwtAudiences] = React.useState<string[]>(initialData.environment.jwtAudiences);

  // Dirty state tracking
  const isDirty = React.useMemo(() => {
    return (
      allowDynamicClientRegistration !== initialData.featureFlags.allowDynamicClientRegistration ||
      JSON.stringify(jwtAudiences) !== JSON.stringify(initialData.environment.jwtAudiences)
    );
  }, [allowDynamicClientRegistration, jwtAudiences, initialData]);

  const handleReset = () => {
    setAllowDynamicClientRegistration(initialData.featureFlags.allowDynamicClientRegistration);
    setJwtAudiences(initialData.environment.jwtAudiences);
  };

  const handleSave = () => {
    // Mock save - in real implementation, this would call a server action
    alert("Settings saved! (Mock only - no backend integration yet)");
  };

  return (
    <div className="flex flex-col gap-8">
        {/* Section: Environment Configuration */}
        <Card className="border border-border-dark bg-card">
          <CardHeader className="border-border-dark">
            <CardTitle className="text-lg font-bold">Environment Configuration</CardTitle>
            <p className="text-gray-400 text-sm font-normal mt-1">
              These values are derived from your environment and cannot be changed here.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <CopyableInput 
                label="Issuer" 
                value={initialData.environment.issuer}
                labelClassName="text-sm font-medium text-gray-400"
              />
              <CopyableInput 
                label="Base URL" 
                value={initialData.environment.baseUrl}
                labelClassName="text-sm font-medium text-gray-400"
              />
              <div>
                <label className="text-sm font-medium text-gray-400 block mb-1.5">Rotation Cadence</label>
                <p className="text-white text-sm px-4 py-2.5 bg-input border border-slate-700 rounded-lg">
                  {initialData.environment.rotationCadence}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section: JWT Audiences */}
        <Card className="border border-border-dark bg-card">
          <CardHeader className="border-border-dark">
            <CardTitle className="text-lg font-bold">JWT Audiences</CardTitle>
            <p className="text-gray-400 text-sm font-normal mt-1">
              Configure allowed audiences for JWT token validation. At least one audience is required.
            </p>
          </CardHeader>
          <CardContent>
            <UrlListBuilder
              urls={jwtAudiences}
              onChange={setJwtAudiences}
              placeholder="https://api.example.com"
              minUrls={1}
              validateUrl={true}
            />
          </CardContent>
        </Card>

        {/* Section: Feature Flags */}
        <Card className="border border-border-dark bg-card">
          <CardHeader className="border-border-dark">
            <CardTitle className="text-lg font-bold">Feature Flags</CardTitle>
            <p className="text-gray-400 text-sm font-normal mt-1">
              Enable or disable specific application features.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="pr-4 flex-1">
                <p className="text-white font-medium">Allow Dynamic Client Registration</p>
                <p className="text-gray-400 text-sm mt-1">
                  Permits OAuth/OIDC clients to be created dynamically via an API endpoint.
                </p>
              </div>
              <Checkbox
                checked={allowDynamicClientRegistration}
                onChange={setAllowDynamicClientRegistration}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section: Internal API Secrets */}
        <Card className="border border-border-dark bg-card">
          <CardHeader className="border-border-dark">
            <CardTitle className="text-lg font-bold">Internal API Secrets</CardTitle>
            <p className="text-gray-400 text-sm font-normal mt-1">
              Manage the status of internal secrets used for service-to-service communication.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <SecretStatusRow secret={initialData.secrets.betterAuthSecret} />
              <SecretStatusRow secret={initialData.secrets.cronSecret} />
              <SecretStatusRow secret={initialData.secrets.jwksRotationSecret} />
            </div>
          </CardContent>
        </Card>

        {/* Section: Webhook Registration */}
        <Card className="border border-border-dark bg-card">
          <CardHeader className="border-border-dark">
            <CardTitle className="text-lg font-bold">Webhook Registration (Payload CMS)</CardTitle>
            <p className="text-gray-400 text-sm font-normal mt-1">
              Configure webhook delivery to Payload CMS for user sync events and bidirectional synchronization.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Webhook URL */}
              <div>
                <CopyableInput
                  label="Payload Webhook URL" 
                  value={initialData.webhook.payloadWebhookUrl}
                  labelClassName="text-sm font-medium text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-2">
                  Endpoint where user sync events are delivered. Configured via PAYLOAD_WEBHOOK_URL environment variable.
                </p>
              </div>

              {/* Webhook Secrets Status */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3">Webhook Security</h4>
                <div className="space-y-3">
                  <SecretStatusRow secret={initialData.webhook.payloadOutboundSecret} />
                  <SecretStatusRow secret={initialData.webhook.payloadInboundSecret} />
                  <SecretStatusRow secret={initialData.webhook.qstashToken} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="mt-10 flex justify-end gap-3 border-t border-white/10 pt-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty}
          >
            Save Changes
          </Button>
        </div>
      </div>
  );
}
