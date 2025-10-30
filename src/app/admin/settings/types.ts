export interface SecretStatus {
  name: string;
  isSet: boolean;
  description: string;
}

export interface EnvironmentConfig {
  issuer: string;
  baseUrl: string;
  rotationCadence: string;
  jwtAudiences: string[];
}

export interface FeatureFlags {
  allowDynamicClientRegistration: boolean;
}

export interface SecretsConfig {
  jwksRotationSecret: SecretStatus;
  cronSecret: SecretStatus;
  betterAuthSecret: SecretStatus;
}

export interface WebhookConfig {
  payloadWebhookUrl: string;
  payloadOutboundSecret: SecretStatus;
  payloadInboundSecret: SecretStatus;
  qstashToken: SecretStatus;
}

export interface SettingsData {
  environment: EnvironmentConfig;
  featureFlags: FeatureFlags;
  secrets: SecretsConfig;
  webhook: WebhookConfig;
}
