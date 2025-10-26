import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: ".env" });

const serverSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_DATABASE_URL: z.string().min(1, "BETTER_AUTH_DATABASE_URL is required"),
  BETTER_AUTH_DATABASE_AUTH_TOKEN: z.string().optional(),
  JWT_ISSUER: z.string().url("JWT_ISSUER must be a valid URL"),
  JWT_AUDIENCE: z
    .string()
    .min(1, "JWT_AUDIENCE must include at least one audience value")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  PAYLOAD_CLIENT_ID: z.string().min(1, "PAYLOAD_CLIENT_ID is required"),
  PAYLOAD_CLIENT_SECRET: z.string().min(1, "PAYLOAD_CLIENT_SECRET is required"),
  PAYLOAD_REDIRECT_URI: z.string().url("PAYLOAD_REDIRECT_URI must be a valid URL"),
  PAYLOAD_SPA_CLIENT_ID: z.string().min(1, "PAYLOAD_SPA_CLIENT_ID is required"),
  PAYLOAD_SPA_REDIRECT_URIS: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  PAYLOAD_SPA_LOGOUT_URIS: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .optional(),
  PRODUCTION_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
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
} = {
  ...serverEnv,
  ...clientEnv,
};
