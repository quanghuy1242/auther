import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: ".env", quiet: true });

function parseCommaSeparatedList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const serverSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_DATABASE_URL: z.string().min(1, "BETTER_AUTH_DATABASE_URL is required"),
  BETTER_AUTH_DATABASE_AUTH_TOKEN: z.string().optional(),
  JWT_ISSUER: z.string().url("JWT_ISSUER must be a valid URL"),
  JWT_AUDIENCE: z
    .string()
    .min(1, "JWT_AUDIENCE must include at least one audience value")
    .transform(parseCommaSeparatedList),
  PAYLOAD_CLIENT_ID: z.string().min(1, "PAYLOAD_CLIENT_ID is required"),
  PAYLOAD_CLIENT_SECRET: z.string().min(1, "PAYLOAD_CLIENT_SECRET is required"),
  PAYLOAD_REDIRECT_URI: z.string().url("PAYLOAD_REDIRECT_URI must be a valid URL"),
  PAYLOAD_SPA_CLIENT_ID: z.string().min(1, "PAYLOAD_SPA_CLIENT_ID is required"),
  PAYLOAD_SPA_REDIRECT_URIS: z
    .string()
    .transform(parseCommaSeparatedList),
  PAYLOAD_SPA_LOGOUT_URIS: z
    .string()
    .transform(parseCommaSeparatedList)
    .optional(),
  PAYLOAD_PREVIEW_ORIGIN_PATTERNS: z
    .string()
    .transform(parseCommaSeparatedList)
    .optional(),
  PRODUCTION_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  QSTASH_TOKEN: z.string().min(1, "QSTASH_TOKEN is required"),
  QSTASH_URL: z.string().url("QSTASH_URL must be a valid URL").optional(),
  QSTASH_CURRENT_SIGNING_KEY: z
    .string()
    .min(1, "QSTASH_CURRENT_SIGNING_KEY is required"),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  QUEUE_TARGET_BASE_URL: z.string().url("QUEUE_TARGET_BASE_URL must be a valid URL").optional(),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
  PAYLOAD_WEBHOOK_URL: z.string().url("PAYLOAD_WEBHOOK_URL must be a valid URL"),
  PAYLOAD_OUTBOUND_WEBHOOK_SECRET: z
    .string()
    .min(32, "PAYLOAD_OUTBOUND_WEBHOOK_SECRET must be at least 32 characters"),
  PAYLOAD_INBOUND_WEBHOOK_SECRET: z
    .string()
    .min(32, "PAYLOAD_INBOUND_WEBHOOK_SECRET must be at least 32 characters"),
  VERCEL_URL: z.string().optional(),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  EMAIL_FROM: z.string().email("EMAIL_FROM must be a valid email"),
  EMAIL_FROM_NAME: z.string().min(1, "EMAIL_FROM_NAME is required"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function parseEnv<T extends z.ZodTypeAny>(schema: T, source: Record<string, string | undefined>) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const formatted = parsed.error.format();
    const errors = Object.entries(formatted)
      .map(([key, value]) => {
        if (key === "_errors") return null;
        const messages = (value as z.ZodFormattedError<unknown>)._errors;
        return messages.length ? `${key}: ${messages.join(", ")}` : null;
      })
      .filter(Boolean)
      .join("; ");
    throw new Error(`Invalid environment variables: ${errors || "Unknown error"}`);
  }
  return parsed.data as z.infer<T>;
}

const serverEnv = parseEnv(serverSchema, process.env);
const clientEnv = parseEnv(clientSchema, {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export const env: ServerEnv & ClientEnv & {
  JWT_AUDIENCE: string[];
  PAYLOAD_SPA_REDIRECT_URIS: string[];
  PAYLOAD_SPA_LOGOUT_URIS?: string[];
  PAYLOAD_PREVIEW_ORIGIN_PATTERNS: string[];
} = {
  ...serverEnv,
  ...clientEnv,
  PAYLOAD_PREVIEW_ORIGIN_PATTERNS: serverEnv.PAYLOAD_PREVIEW_ORIGIN_PATTERNS ?? [],
};
