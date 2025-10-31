export interface EmailVerificationData {
  email: string;
  verificationUrl: string;
}

export interface PasswordResetData {
  email: string;
  resetUrl: string;
}
