"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Icon, Checkbox, CopyableField, UrlListBuilder } from "@/components/ui";
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
        <Card className="bg-[#1a2633]/50 border border-white/10">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-lg font-bold">Environment Configuration</CardTitle>
            <p className="text-[#93adc8] text-sm font-normal mt-1">
              These values are derived from your environment and cannot be changed here.
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-col">
              <CopyableField label="Issuer" value={initialData.environment.issuer} />
              <CopyableField label="Base URL" value={initialData.environment.baseUrl} />
              <CopyableField 
                label="Rotation Cadence" 
                value={initialData.environment.rotationCadence} 
                copyable={false}
                className="border-b-0"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section: JWT Audiences */}
        <Card className="bg-[#1a2633]/50 border border-white/10">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-lg font-bold">JWT Audiences</CardTitle>
            <p className="text-[#93adc8] text-sm font-normal mt-1">
              Configure allowed audiences for JWT token validation. At least one audience is required.
            </p>
          </CardHeader>
          <CardContent className="p-6">
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
        <Card className="bg-[#1a2633]/50 border border-white/10">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-lg font-bold">Feature Flags</CardTitle>
            <p className="text-[#93adc8] text-sm font-normal mt-1">
              Enable or disable specific application features.
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="pr-4 flex-1">
                <p className="text-white font-medium">Allow Dynamic Client Registration</p>
                <p className="text-[#93adc8] text-sm mt-1">
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
        <Card className="bg-[#1a2633]/50 border border-white/10">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-lg font-bold">Internal API Secrets</CardTitle>
            <p className="text-[#93adc8] text-sm font-normal mt-1">
              Manage the status of internal secrets used for service-to-service communication.
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <SecretStatusRow secret={initialData.secrets.betterAuthSecret} />
              <SecretStatusRow secret={initialData.secrets.cronSecret} />
              <SecretStatusRow secret={initialData.secrets.jwksRotationSecret} />
            </div>
          </CardContent>
        </Card>

        {/* Section: Webhook Registration */}
        <Card className="bg-[#1a2633]/50 border border-white/10">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-lg font-bold">Webhook Registration (Payload CMS)</CardTitle>
            <p className="text-[#93adc8] text-sm font-normal mt-1">
              Configure webhook delivery to Payload CMS for user sync events and bidirectional synchronization.
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* Webhook URL */}
              <div>
                <CopyableField 
                  label="Payload Webhook URL" 
                  value={initialData.webhook.payloadWebhookUrl} 
                  className="border-b-0"
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
            onClick={handleReset}
            disabled={!isDirty}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isDirty}
          >
            Save Changes
          </Button>
        </div>
      </div>
  );
}

interface SecretStatusRowProps {
  secret: {
    name: string;
    isSet: boolean;
    description: string;
  };
}

function SecretStatusRow({ secret }: SecretStatusRowProps) {
  return (
    <div className="flex items-start sm:items-center justify-between py-3 px-4 bg-[#111921] rounded-lg border border-white/10 gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <p className="text-white font-medium font-mono text-sm break-all">{secret.name}</p>
        <div className="relative group flex-shrink-0">
          <Icon name="info" className="!text-base text-white/50 cursor-pointer" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[#0d131a] border border-white/10 rounded-lg text-xs text-[#93adc8] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {secret.description}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0">
        {secret.isSet ? (
          <Badge variant="success" dot>
            Set
          </Badge>
        ) : (
          <Badge variant="warning" dot>
            Not Set
          </Badge>
        )}
      </div>
    </div>
  );
}
