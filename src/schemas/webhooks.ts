import { z } from "zod";
import { booleanField } from "@/lib/utils/validation";
import { WEBHOOK_EVENT_TYPES } from "@/lib/constants";

export const webhookSchema = z.object({
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(100, "Display name must be less than 100 characters"),
  url: z
    .string()
    .optional()
    .refine(
      (url) => {
        // Empty/undefined URL is valid (webhook will be disabled)
        if (!url || url.trim() === "") return true;
        // If URL is provided, validate it
        try {
          new URL(url);
        } catch {
          return false;
        }
        // Allow HTTPS, localhost, and Docker network URLs
        return (
          url.startsWith("https://") ||
          url.startsWith("http://localhost") ||
          url.startsWith("http://127.0.0.1") ||
          /^http:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*:[0-9]+/.test(url)
        );
      },
      "URL must use HTTPS or be a valid local/Docker network URL (http://localhost, http://service-name:port)"
    ),
  isActive: booleanField.default(false), // Default to false since URL may not be set
  eventTypes: z
    .array(z.string())
    .min(1, "At least one event type must be selected")
    .refine(
      (types) =>
        types.every((t) =>
          WEBHOOK_EVENT_TYPES.some((evt) => evt.value === t)
        ),
      "Invalid event type selected"
    ),
  retryPolicy: z.enum(["none", "standard", "aggressive"]).default("standard"),
  deliveryFormat: z.enum(["json", "form-encoded"]).default("json"),
  requestMethod: z.enum(["POST", "PUT"]).default("POST"),
}).refine(
  (data) => {
    // If no URL, isActive must be false
    if (!data.url || data.url.trim() === "") {
      return data.isActive === false;
    }
    return true;
  },
  {
    message: "Webhook cannot be enabled without a URL configured",
    path: ["isActive"],
  }
);

// UI Constants related to the schema
export const RETRY_POLICY_OPTIONS = [
  { value: "none", label: "No Retries" },
  { value: "standard", label: "Standard (3 retries)" },
  { value: "aggressive", label: "Aggressive (5 retries)" },
];

export const DELIVERY_FORMAT_OPTIONS = [
  { value: "json", label: "JSON" },
  { value: "form-encoded", label: "Form-encoded" },
];

export const REQUEST_METHOD_OPTIONS = [
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
];
