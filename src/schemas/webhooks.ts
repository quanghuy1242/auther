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
    .url("Must be a valid URL")
    .refine(
      (url) => {
        // Allow HTTPS, localhost, and Docker network URLs (e.g., http://webhook-tester:8080)
        return (
          url.startsWith("https://") || 
          url.startsWith("http://localhost") ||
          url.startsWith("http://127.0.0.1") ||
          /^http:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*:[0-9]+/.test(url) // Docker service names with port
        );
      },
      "URL must use HTTPS or be a valid local/Docker network URL (http://localhost, http://service-name:port)"
    ),
  isActive: booleanField.default(true),
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
});

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
