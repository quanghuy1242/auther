/**
 * Shared Type Definitions for Admin UI Component Library
 * Design system types, variants, and polymorphic component utilities
 */

// ============================================================================
// Component Variants
// ============================================================================

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type InputVariant =
  | "default"
  | "error"
  | "success";

export type AlertVariant =
  | "info"
  | "warning"
  | "error"
  | "success";

// ============================================================================
// Size Types
// ============================================================================

export type Size = "xs" | "sm" | "md" | "lg" | "xl";
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

// ============================================================================
// Design System Colors
// ============================================================================

export const colors = {
  primary: "#1773cf",
  primaryHover: "#145ba8",

  background: {
    light: "#f6f7f8",
    dark: "#111921",
  },

  content: {
    light: "#ffffff",
    dark: "#18232f",
  },

  card: {
    light: "#ffffff",
    dark: "#1a2632",
  },

  border: {
    light: "#e5e7eb",
    dark: "#243647",
    darker: "#344d65",
  },

  text: {
    light: {
      primary: "#111827",
      secondary: "#6b7280",
    },
    dark: {
      primary: "#ffffff",
      secondary: "#93adc8",
    },
  },

  hover: {
    light: "#f3f4f6",
    dark: "#243647",
  },

  sidebar: "#1a2632",

  status: {
    success: "#28a745",
    warning: "#FFC107",
    danger: "#DC3545",
    info: "#1773cf",
  },
} as const;

// ============================================================================
// Polymorphic Component Utilities
// ============================================================================

/**
 * Props for polymorphic components that accept an 'as' prop
 * Allows components to render as different HTML elements while maintaining type safety
 * 
 * @example
 * type ButtonProps<E extends React.ElementType = 'button'> = PolymorphicComponentProps<E, {
 *   variant?: ButtonVariant;
 * }>;
 */
export type PolymorphicComponentProps<
  E extends React.ElementType,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  P = {}
> = P &
  Omit<React.ComponentPropsWithoutRef<E>, keyof P> & {
    as?: E;
  };

/**
 * Props for polymorphic components that forward refs
 */
export type PolymorphicComponentPropsWithRef<
  E extends React.ElementType,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  P = {}
> = PolymorphicComponentProps<E, P> & {
  ref?: React.ComponentPropsWithRef<E>['ref'];
};

// ============================================================================
// Common Component Props
// ============================================================================

/**
 * Common props for UI components with className support
 */
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Props for components with loading states
 */
export interface LoadingProps {
  isLoading?: boolean;
  loadingText?: string;
}

/**
 * Props for components with disabled states
 */
export interface DisabledProps {
  disabled?: boolean;
}

/**
 * Props for form field components
 */
export interface FormFieldProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

// ============================================================================
// Icon Props
// ============================================================================

export interface IconProps extends BaseComponentProps {
  name: string;
  size?: IconSize;
  filled?: boolean;
}

// ============================================================================
// Status Types
// ============================================================================

export type Status = "active" | "inactive" | "pending" | "disabled";
export type VerificationStatus = "verified" | "unverified";
export type ClientType = "trusted" | "dynamic";

// ============================================================================
// Table Types
// ============================================================================

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export interface PaginationConfig {
  page: number;
  perPage: number;
  total: number;
}

// ============================================================================
// Form Types
// ============================================================================

export interface FormState<T = unknown> {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
  data?: T;
}

// ============================================================================
// Navigation Types
// ============================================================================

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: string | number;
  children?: NavItem[];
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isButtonVariant(value: string): value is ButtonVariant {
  return ["primary", "secondary", "ghost", "danger", "success"].includes(value);
}

export function isBadgeVariant(value: string): value is BadgeVariant {
  return ["default", "success", "warning", "danger", "info"].includes(value);
}

export function isSize(value: string): value is Size {
  return ["xs", "sm", "md", "lg", "xl"].includes(value);
}

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookRetryPolicy = "none" | "standard" | "aggressive";
export type WebhookDeliveryFormat = "json" | "form-encoded";
export type WebhookRequestMethod = "POST" | "PUT";
export type WebhookDeliveryStatus = "pending" | "success" | "failed" | "retrying" | "dead";

/**
 * Webhook endpoint entity (matches database schema)
 */
export interface WebhookEndpointEntity {
  id: string;
  userId: string;
  displayName: string;
  url: string | null; // Nullable - webhooks can be created without URL (pending setup)
  encryptedSecret: string;
  isActive: boolean;
  retryPolicy: WebhookRetryPolicy;
  deliveryFormat: WebhookDeliveryFormat;
  requestMethod: WebhookRequestMethod;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Webhook endpoint with subscriptions (for UI display)
 */
export interface WebhookEndpointWithSubscriptions extends WebhookEndpointEntity {
  subscriptions: WebhookSubscriptionEntity[];
  lastDelivery?: {
    status: WebhookDeliveryStatus;
    timestamp: Date;
    responseCode?: number;
  } | null;
}

/**
 * Webhook subscription entity (maps endpoint to event types)
 */
export interface WebhookSubscriptionEntity {
  id: string;
  endpointId: string;
  eventType: string;
  createdAt: Date;
}

/**
 * Webhook event entity (audit log of events that occurred)
 */
export interface WebhookEventEntity {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Webhook delivery entity (tracks delivery attempts)
 */
export interface WebhookDeliveryEntity {
  id: string;
  eventId: string;
  endpointId: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  responseCode?: number | null;
  responseBody?: string | null;
  durationMs?: number | null;
  lastAttemptAt?: Date | null;
  createdAt: Date;
}

/**
 * Delivery statistics for metrics display
 */
export interface WebhookDeliveryStats {
  successRate: number;
  trend: number; // percentage change vs previous period
  dailyData: {
    day: string;
    successCount: number;
    failedCount: number;
    successRate: number;
  }[];
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
}

/**
 * Paginated result for webhook queries
 */
export interface WebhookPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

