// Mock data for webhook management UI
export type WebhookStatus = "active" | "inactive";
export type DeliveryStatus = "success" | "failed" | "pending";
export type RetryPolicy = "exponential" | "linear" | "none";
export type DeliveryFormat = "json" | "form-encoded";
export type RequestMethod = "POST" | "PUT";

export interface WebhookEndpoint {
  id: string;
  displayName: string | null;
  url: string;
  secret: string;
  isActive: boolean;
  events: string[];
  lastDelivery: {
    status: DeliveryStatus;
    timestamp: Date;
  } | null;
  createdAt: Date;
  retryPolicy: RetryPolicy;
  deliveryFormat: DeliveryFormat;
  requestMethod: RequestMethod;
  customPayloadTemplate?: string;
  emailNotifications: boolean;
  slackNotifications: boolean;
}

export interface WebhookDelivery {
  id: string;
  eventType: string;
  status: DeliveryStatus;
  timestamp: Date;
  responseCode: number | null;
  durationMs: number | null;
  attemptCount: number;
  errorMessage?: string;
}

export interface DeliveryStats {
  successRate: number;
  trend: number; // percentage change vs previous period
  dailyData: {
    day: string; // Mon, Tue, Wed, etc.
    successCount: number;
    failedCount: number;
    successRate: number;
  }[];
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
}

// Available event types
export const WEBHOOK_EVENT_TYPES = [
  { value: "user.created", label: "User Created", description: "Triggered when a new user registers" },
  { value: "user.updated", label: "User Updated", description: "Triggered when user profile is updated" },
  { value: "user.deleted", label: "User Deleted", description: "Triggered when a user account is deleted" },
  { value: "user.verified", label: "User Verified", description: "Triggered when user verifies their email" },
  { value: "session.created", label: "Session Created", description: "Triggered when user signs in" },
  { value: "session.deleted", label: "Session Deleted", description: "Triggered when user signs out" },
  { value: "oauth.token.issued", label: "OAuth Token Issued", description: "Triggered when OAuth token is generated" },
  { value: "oauth.consent.granted", label: "OAuth Consent Granted", description: "Triggered when user grants OAuth consent" },
  { value: "client.created", label: "Client Created", description: "Triggered when OAuth client is registered" },
  { value: "client.updated", label: "Client Updated", description: "Triggered when OAuth client is modified" },
] as const;

// Mock webhook endpoints
export const MOCK_WEBHOOKS: WebhookEndpoint[] = [
  {
    id: "wh_1",
    displayName: "Production API",
    url: "https://api.production.example.com/webhooks/auth",
    secret: "whsec_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456",
    isActive: true,
    events: ["user.created", "user.verified", "session.created"],
    lastDelivery: {
      status: "success",
      timestamp: new Date(Date.now() - 2 * 60 * 1000), // 2 mins ago
    },
    createdAt: new Date("2024-01-15"),
    retryPolicy: "exponential",
    deliveryFormat: "json",
    requestMethod: "POST",
    emailNotifications: true,
    slackNotifications: false,
  },
  {
    id: "wh_2",
    displayName: "Analytics Service",
    url: "https://analytics.example.com/webhook-receiver",
    secret: "whsec_xYz987654321aBcDeFgHiJkLmNoP",
    isActive: true,
    events: ["user.created", "user.updated", "session.created", "session.deleted"],
    lastDelivery: {
      status: "success",
      timestamp: new Date(Date.now() - 45 * 60 * 1000), // 45 mins ago
    },
    createdAt: new Date("2024-02-20"),
    retryPolicy: "exponential",
    deliveryFormat: "json",
    requestMethod: "POST",
    emailNotifications: false,
    slackNotifications: true,
  },
  {
    id: "wh_3",
    displayName: null,
    url: "https://notification-service.internal.company.net/hooks/auth-events",
    secret: "whsec_QwErTyUiOpAsDfGhJkLzXcVbNm123",
    isActive: true,
    events: ["user.deleted", "session.deleted"],
    lastDelivery: {
      status: "failed",
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    },
    createdAt: new Date("2024-03-10"),
    retryPolicy: "linear",
    deliveryFormat: "json",
    requestMethod: "POST",
    emailNotifications: true,
    slackNotifications: true,
  },
  {
    id: "wh_4",
    displayName: "Customer Success Platform",
    url: "https://webhook.customer-success.io/events",
    secret: "whsec_PlMoKnIjBhUvGyCdTfXrEsZ123456",
    isActive: false,
    events: ["user.created", "user.verified"],
    lastDelivery: {
      status: "success",
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    },
    createdAt: new Date("2024-01-05"),
    retryPolicy: "exponential",
    deliveryFormat: "json",
    requestMethod: "POST",
    emailNotifications: false,
    slackNotifications: false,
  },
  {
    id: "wh_5",
    displayName: "Staging Environment",
    url: "https://staging-api.example.com/webhooks",
    secret: "whsec_StAgInGsEcReT123456789aBcDeF",
    isActive: true,
    events: ["user.created", "user.updated", "user.deleted", "user.verified"],
    lastDelivery: {
      status: "success",
      timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 mins ago
    },
    createdAt: new Date("2024-03-25"),
    retryPolicy: "exponential",
    deliveryFormat: "json",
    requestMethod: "POST",
    emailNotifications: false,
    slackNotifications: false,
  },
  {
    id: "wh_6",
    displayName: "Email Marketing Integration",
    url: "https://hooks.emailmarketing.com/api/v2/webhooks/receive",
    secret: "whsec_EmAiLmArKeTiNg123456789XyZ",
    isActive: true,
    events: ["user.created", "user.verified", "user.updated"],
    lastDelivery: {
      status: "success",
      timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 mins ago
    },
    createdAt: new Date("2024-02-01"),
    retryPolicy: "exponential",
    deliveryFormat: "json",
    requestMethod: "POST",
    customPayloadTemplate: `{
  "email": "{{user.email}}",
  "name": "{{user.name}}",
  "event": "{{event.type}}",
  "timestamp": "{{event.timestamp}}"
}`,
    emailNotifications: true,
    slackNotifications: false,
  },
  {
    id: "wh_7",
    displayName: "Compliance Logging",
    url: "https://compliance-logger.secure.company.internal/webhooks",
    secret: "whsec_CoMpLiAnCeLOgGeR987654321",
    isActive: true,
    events: [
      "user.created",
      "user.updated",
      "user.deleted",
      "session.created",
      "session.deleted",
      "oauth.token.issued",
      "oauth.consent.granted",
    ],
    lastDelivery: {
      status: "success",
      timestamp: new Date(Date.now() - 1 * 60 * 1000), // 1 min ago
    },
    createdAt: new Date("2023-12-01"),
    retryPolicy: "none",
    deliveryFormat: "json",
    requestMethod: "POST",
    emailNotifications: true,
    slackNotifications: true,
  },
  {
    id: "wh_8",
    displayName: null,
    url: "https://dev.localhost:3000/api/webhook-test",
    secret: "whsec_LoCalDeVtEsTiNg123456789",
    isActive: false,
    events: ["user.created"],
    lastDelivery: null, // Never delivered
    createdAt: new Date("2024-04-01"),
    retryPolicy: "exponential",
    deliveryFormat: "json",
    requestMethod: "POST",
    emailNotifications: false,
    slackNotifications: false,
  },
  {
    id: "wh_9",
    displayName: "Fraud Detection Service",
    url: "https://fraud-detection.security.example.com/webhooks/auth-events",
    secret: "whsec_FrAuDdEtEcTiOn123456789XyZ",
    isActive: true,
    events: ["user.created", "session.created", "oauth.token.issued"],
    lastDelivery: {
      status: "failed",
      timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
    },
    createdAt: new Date("2024-01-20"),
    retryPolicy: "exponential",
    deliveryFormat: "json",
    requestMethod: "POST",
    emailNotifications: true,
    slackNotifications: true,
  },
  {
    id: "wh_10",
    displayName: "Legacy CRM Sync",
    url: "https://crm-legacy.company.com/integration/webhooks",
    secret: "whsec_LeGaCyCrMsYnC987654321aBcD",
    isActive: true,
    events: ["user.created", "user.updated"],
    lastDelivery: {
      status: "success",
      timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
    },
    createdAt: new Date("2023-11-15"),
    retryPolicy: "linear",
    deliveryFormat: "form-encoded",
    requestMethod: "PUT",
    emailNotifications: false,
    slackNotifications: false,
  },
];

// Mock delivery statistics (last 7 days)
export const MOCK_DELIVERY_STATS: DeliveryStats = {
  successRate: 98.5,
  trend: 0.2, // +0.2% vs previous 7 days
  dailyData: [
    { day: "Mon", successCount: 245, failedCount: 3, successRate: 98.8 },
    { day: "Tue", successCount: 289, failedCount: 5, successRate: 98.3 },
    { day: "Wed", successCount: 312, failedCount: 2, successRate: 99.4 },
    { day: "Thu", successCount: 278, failedCount: 6, successRate: 97.9 },
    { day: "Fri", successCount: 301, failedCount: 4, successRate: 98.7 },
    { day: "Sat", successCount: 198, failedCount: 3, successRate: 98.5 },
    { day: "Sun", successCount: 156, failedCount: 2, successRate: 98.7 },
  ],
  totalDeliveries: 1794,
  successfulDeliveries: 1767,
  failedDeliveries: 27,
};

// Mock delivery history for a specific webhook
export const getMockDeliveryHistory = (webhookId: string): WebhookDelivery[] => {
  const baseTimestamp = Date.now();
  const deliveries: WebhookDelivery[] = [];

  for (let i = 0; i < 25; i++) {
    const minutesAgo = i * 30 + Math.floor(Math.random() * 20);
    const isSuccess = Math.random() > 0.05; // 95% success rate

    deliveries.push({
      id: `del_${webhookId}_${i}`,
      eventType: WEBHOOK_EVENT_TYPES[Math.floor(Math.random() * 6)].value,
      status: isSuccess ? "success" : "failed",
      timestamp: new Date(baseTimestamp - minutesAgo * 60 * 1000),
      responseCode: isSuccess ? 200 : Math.random() > 0.5 ? 500 : 404,
      durationMs: isSuccess ? Math.floor(Math.random() * 500) + 50 : null,
      attemptCount: isSuccess ? 1 : Math.floor(Math.random() * 3) + 1,
      errorMessage: isSuccess ? undefined : "Connection timeout",
    });
  }

  return deliveries;
};

// Helper to filter webhooks
export const filterWebhooks = (
  webhooks: WebhookEndpoint[],
  filters: {
    search?: string;
    status?: "all" | "active" | "inactive";
    eventType?: string;
  }
): WebhookEndpoint[] => {
  let filtered = [...webhooks];

  // Search filter
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (wh) =>
        wh.displayName?.toLowerCase().includes(searchLower) ||
        wh.url.toLowerCase().includes(searchLower)
    );
  }

  // Status filter
  if (filters.status && filters.status !== "all") {
    filtered = filtered.filter((wh) =>
      filters.status === "active" ? wh.isActive : !wh.isActive
    );
  }

  // Event type filter
  if (filters.eventType && filters.eventType !== "all") {
    filtered = filtered.filter((wh) => wh.events.includes(filters.eventType!));
  }

  return filtered;
};

// Helper to format relative time
export const formatRelativeTime = (date: Date): string => {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

// Helper to get webhook by ID
export const getWebhookById = (id: string): WebhookEndpoint | undefined => {
  return MOCK_WEBHOOKS.find((wh) => wh.id === id);
};
