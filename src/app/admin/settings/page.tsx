import * as React from "react";
import { requireAuth } from "@/lib/session";
import { PageHeading } from "@/components/layout/page-heading";
import { env } from "@/env";
import { getRotationCadenceDisplay } from "@/lib/constants";
import { resolveQueueBaseUrl } from "@/lib/webhooks/payload";
import { SettingsClient } from "./settings-client";
import type { SettingsData } from "./types";

export default async function SettingsPage() {
  await requireAuth();

  // Construct settings data from environment
  const settingsData: SettingsData = {
    environment: {
      issuer: env.JWT_ISSUER,
      baseUrl: resolveQueueBaseUrl(),
      rotationCadence: getRotationCadenceDisplay(),
      jwtAudiences: env.JWT_AUDIENCE,
    },
    featureFlags: {
      allowDynamicClientRegistration: true, // Mock value
    },
    secrets: {
      jwksRotationSecret: {
        name: "JWKS_ROTATION_SECRET",
        isSet: false,
        description: "Internal secret for JWKS key rotation operations. Set in .env as JWKS_ROTATION_SECRET (32+ characters).",
      },
      cronSecret: {
        name: "CRON_SECRET",
        isSet: !!env.CRON_SECRET,
        description: "Secret for authenticating internal cron jobs and scheduled tasks. Set in .env as CRON_SECRET.",
      },
      betterAuthSecret: {
        name: "BETTER_AUTH_SECRET",
        isSet: !!env.BETTER_AUTH_SECRET,
        description: "Core authentication secret used for session encryption and token signing. Set in .env as BETTER_AUTH_SECRET (32+ characters).",
      },
    },
    webhook: {
      payloadWebhookUrl: env.PAYLOAD_WEBHOOK_URL,
      payloadOutboundSecret: {
        name: "PAYLOAD_OUTBOUND_WEBHOOK_SECRET",
        isSet: !!env.PAYLOAD_OUTBOUND_WEBHOOK_SECRET,
        description: "Secret for signing outbound webhooks sent to Payload CMS. Set in .env as PAYLOAD_OUTBOUND_WEBHOOK_SECRET (32+ characters).",
      },
      payloadInboundSecret: {
        name: "PAYLOAD_INBOUND_WEBHOOK_SECRET",
        isSet: !!env.PAYLOAD_INBOUND_WEBHOOK_SECRET,
        description: "Secret for verifying inbound webhooks received from Payload CMS. Set in .env as PAYLOAD_INBOUND_WEBHOOK_SECRET (32+ characters).",
      },
      qstashToken: {
        name: "QSTASH_TOKEN",
        isSet: !!env.QSTASH_TOKEN,
        description: "QStash API token for webhook queue management and delivery. Set in .env as QSTASH_TOKEN.",
      },
    },
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeading
        title="Configuration & Secrets"
        description="Manage environment settings, feature flags, and internal secrets."
      />
      <SettingsClient initialData={settingsData} />
    </div>
  );
}
