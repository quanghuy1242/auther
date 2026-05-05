"use client";

import * as React from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { toast } from "@/lib/toast";

type ConsentFormProps = {
  clientId: string;
  consentCode: string;
  scopes: string[];
};

export function ConsentForm({ clientId, consentCode, scopes }: ConsentFormProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const submitConsent = async (accept: boolean) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accept,
          consent_code: consentCode,
        }),
      });

      const payload = await response.json().catch(() => null) as { redirectURI?: unknown } | null;
      if (!response.ok || typeof payload?.redirectURI !== "string") {
        throw new Error("Consent request failed.");
      }

      window.location.assign(payload.redirectURI);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Consent request failed.");
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Authorize Application</CardTitle>
        <CardDescription>
          {clientId} is requesting access to your Auther account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border-dark bg-black/10 p-4">
          <p className="text-sm font-medium text-white">Requested scopes</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {scopes.length === 0 ? (
              <span className="text-sm text-gray-400">No scopes requested</span>
            ) : (
              scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-100"
                >
                  {scope}
                </span>
              ))
            )}
          </div>
        </div>

        <p className="text-sm text-gray-400">
          Only approve clients you recognize. Trusted first-party clients can be configured by an admin to skip this prompt.
        </p>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isSubmitting}
            onClick={() => void submitConsent(false)}
          >
            Deny
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isSubmitting}
            onClick={() => void submitConsent(true)}
          >
            Allow
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
