import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Heading,
} from "@react-email/components";
import * as React from "react";

interface PasswordResetTemplateProps {
  resetUrl: string;
}

export const PasswordResetTemplate = ({
  resetUrl,
}: PasswordResetTemplateProps) => {
  return (
    <Html lang="en">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Heading style={heading}>Reset your password</Heading>
            <Text style={text}>
              You recently requested to reset your password. Click the button below to set a new
              password for your account.
            </Text>
            <Button href={resetUrl} style={button}>
              Reset Password
            </Button>
            <Hr style={hr} />
            <Text style={footer}>
              If you didn&apos;t request a password reset, you can safely ignore this email. Your
              password will not be changed.
            </Text>
            <Text style={footer}>
              This link will expire in 1 hour for security reasons.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default PasswordResetTemplate;

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const section = {
  padding: "0 48px",
};

const heading = {
  fontSize: "32px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#1a1a1a",
  marginBottom: "24px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#404040",
  marginBottom: "24px",
};

const button = {
  backgroundColor: "#dc2626",
  borderRadius: "5px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  width: "100%",
  padding: "12px 20px",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "32px 0",
};

const footer = {
  color: "#8898aa",
  fontSize: "14px",
  lineHeight: "22px",
  marginBottom: "8px",
};
