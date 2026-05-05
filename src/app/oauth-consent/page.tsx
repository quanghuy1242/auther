import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ConsentForm } from "./consent-form";

type OAuthConsentPageProps = {
  searchParams: Promise<{
    client_id?: string;
    consent_code?: string;
    scope?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Authorize Application",
  description: "Review and approve OAuth client consent.",
};

export default async function OAuthConsentPage({ searchParams }: OAuthConsentPageProps) {
  const params = await searchParams;
  const clientId = params.client_id?.trim();
  const consentCode = params.consent_code?.trim();

  if (!clientId || !consentCode) {
    redirect("/sign-in?error=invalid_consent_request");
  }

  const scopes = (params.scope ?? "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <ConsentForm clientId={clientId} consentCode={consentCode} scopes={scopes} />
    </main>
  );
}
