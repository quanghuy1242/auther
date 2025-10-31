import { Resend } from "resend";
import { env } from "@/env";

let resendClient: Resend | null = null;

/**
 * Get or create a singleton instance of the Resend client.
 * This ensures only one client is created and reused across the application.
 */
export function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}
