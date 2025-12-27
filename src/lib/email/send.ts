import { render } from "@react-email/components";
import { env } from "@/env";
import { getResendClient } from "./resend";
import { EmailVerificationTemplate } from "./templates/email-verification";
import { PasswordResetTemplate } from "./templates/password-reset";
import { metricsService } from "@/lib/services";

/**
 * Send email verification link to user
 */
export async function sendVerificationEmail(
  email: string,
  verificationUrl: string
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const sendStart = performance.now();
  try {
    if (process.env.SKIP_EMAIL_SENDING === 'true') {
      return { success: true, emailId: 'test-id' };
    }
    const resend = getResendClient();

    const emailHtml = await render(
      EmailVerificationTemplate({ verificationUrl })
    );

    const { data, error } = await resend.emails.send({
      from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
      to: email,
      subject: "Verify your email address",
      html: emailHtml,
    });

    const duration = performance.now() - sendStart;
    void metricsService.histogram("email.send.duration_ms", duration, { type: "verification" });

    if (error) {
      console.error("Failed to send verification email:", error);
      void metricsService.count("email.send.error", 1, { type: "verification" });
      // Check for rate limit error
      if (error.message?.toLowerCase().includes("rate") || error.name === "rate_limit_exceeded") {
        void metricsService.count("email.send.rate_limited.count", 1, { type: "verification" });
      }
      return {
        success: false,
        error: error.message || "Failed to send email",
      };
    }

    void metricsService.count("email.send.success", 1, { type: "verification" });
    return {
      success: true,
      emailId: data?.id,
    };
  } catch (error) {
    console.error("Error sending verification email:", error);
    const duration = performance.now() - sendStart;
    void metricsService.histogram("email.send.duration_ms", duration, { type: "verification" });
    void metricsService.count("email.send.error", 1, { type: "verification" });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send password reset link to user
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const sendStart = performance.now();
  try {
    if (process.env.SKIP_EMAIL_SENDING === 'true') {
      return { success: true, emailId: 'test-id' };
    }
    const resend = getResendClient();

    const emailHtml = await render(
      PasswordResetTemplate({ resetUrl })
    );

    const { data, error } = await resend.emails.send({
      from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
      to: email,
      subject: "Reset your password",
      html: emailHtml,
    });

    const duration = performance.now() - sendStart;
    void metricsService.histogram("email.send.duration_ms", duration, { type: "password_reset" });

    if (error) {
      console.error("Failed to send password reset email:", error);
      void metricsService.count("email.send.error", 1, { type: "password_reset" });
      // Check for rate limit error
      if (error.message?.toLowerCase().includes("rate") || error.name === "rate_limit_exceeded") {
        void metricsService.count("email.send.rate_limited.count", 1, { type: "password_reset" });
      }
      return {
        success: false,
        error: error.message || "Failed to send email",
      };
    }

    void metricsService.count("email.send.success", 1, { type: "password_reset" });
    return {
      success: true,
      emailId: data?.id,
    };
  } catch (error) {
    console.error("Error sending password reset email:", error);
    const duration = performance.now() - sendStart;
    void metricsService.histogram("email.send.duration_ms", duration, { type: "password_reset" });
    void metricsService.count("email.send.error", 1, { type: "password_reset" });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
