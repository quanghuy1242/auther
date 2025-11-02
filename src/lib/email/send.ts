import { render } from "@react-email/components";
import { env } from "@/env";
import { getResendClient } from "./resend";
import { EmailVerificationTemplate } from "./templates/email-verification";
import { PasswordResetTemplate } from "./templates/password-reset";

/**
 * Send email verification link to user
 */
export async function sendVerificationEmail(
  email: string,
  verificationUrl: string
): Promise<{ success: boolean; emailId?: string; error?: string }> {
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

    if (error) {
      console.error("Failed to send verification email:", error);
      return {
        success: false,
        error: error.message || "Failed to send email",
      };
    }

    return {
      success: true,
      emailId: data?.id,
    };
  } catch (error) {
    console.error("Error sending verification email:", error);
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

    if (error) {
      console.error("Failed to send password reset email:", error);
      return {
        success: false,
        error: error.message || "Failed to send email",
      };
    }

    return {
      success: true,
      emailId: data?.id,
    };
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
