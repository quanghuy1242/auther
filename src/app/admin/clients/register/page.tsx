"use client";

import * as React from "react";
import { z } from "zod";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, Button, Icon } from "@/components/ui";
import { FormWrapper, FormField, ControlledSelect, ControlledCheckbox, SubmitButton } from "@/components/forms";
import { registerClient, type RegisterClientState } from "./actions";
import { useRouter } from "next/navigation";

const registerClientSchema = z.object({
  name: z.string().min(2, "Client name must be at least 2 characters"),
  type: z.enum(["web", "spa", "native"], "Please select a client type"),
  redirectURLs: z.string().min(1, "At least one redirect URL is required"),
  trusted: z.boolean().optional(),
  grantTypes: z.string().optional(),
  tokenEndpointAuthMethod: z.enum(["client_secret_basic", "client_secret_post", "none"], "Invalid auth method"),
});

export default function RegisterClientPage() {
  const router = useRouter();
  const [clientData, setClientData] = React.useState<{ clientId: string; clientSecret?: string } | null>(null);
  const [copied, setCopied] = React.useState<"id" | "secret" | null>(null);

  const handleSuccess = (data: unknown) => {
    const result = data as RegisterClientState["data"];
    if (result) {
      setClientData(result);
    }
  };

  const copyToClipboard = (text: string, type: "id" | "secret") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (clientData) {
    return (
      <>
        <PageHeading
          title="Client Registered Successfully"
          description="Save these credentials securely - the secret cannot be retrieved again"
        />

        <div className="max-w-3xl space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <Icon name="warning" className="text-yellow-500 text-2xl flex-shrink-0" />
                <div className="text-sm text-yellow-200">
                  <strong className="block mb-1">Important: Save your credentials now</strong>
                  The client secret will not be shown again. Make sure to copy and store it securely.
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-400 block mb-2">
                    Client ID
                  </label>
                  <div className="flex gap-2">
                    <code className="flex-1 px-4 py-3 bg-[#1a1d24] border border-gray-700 rounded-lg text-sm text-white font-mono">
                      {clientData.clientId}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(clientData.clientId, "id")}
                    >
                      {copied === "id" ? (
                        <>
                          <Icon name="check" /> Copied
                        </>
                      ) : (
                        <>
                          <Icon name="content_copy" /> Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {clientData.clientSecret && (
                  <div>
                    <label className="text-sm font-medium text-gray-400 block mb-2">
                      Client Secret
                    </label>
                    <div className="flex gap-2">
                      <code className="flex-1 px-4 py-3 bg-[#1a1d24] border border-gray-700 rounded-lg text-sm text-white font-mono break-all">
                        {clientData.clientSecret}
                      </code>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(clientData.clientSecret!, "secret")}
                      >
                        {copied === "secret" ? (
                          <>
                            <Icon name="check" /> Copied
                          </>
                        ) : (
                          <>
                            <Icon name="content_copy" /> Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="primary"
                  onClick={() => router.push("/admin/clients")}
                  className="w-full"
                >
                  Go to Clients List
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="Register OAuth Client"
        description="Create a new OAuth 2.0 client application"
      />

      <div className="max-w-3xl">
        <Card>
          <CardContent className="pt-6">
            <FormWrapper
              schema={registerClientSchema}
              action={registerClient}
              onSuccess={handleSuccess}
              className="space-y-6"
            >
              <FormField
                name="name"
                label="Client Name"
                placeholder="My Application"
                required
              />
              <p className="text-sm text-gray-400 -mt-4">A human-readable name for this client</p>

              <ControlledSelect
                name="type"
                label="Application Type"
                placeholder="Select application type"
                required
                options={[
                  { value: "web", label: "Web Application - Server-side app with client secret" },
                  { value: "spa", label: "Single Page App - Browser-based app without secret" },
                  { value: "native", label: "Native App - Mobile or desktop application" },
                ]}
              />

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Redirect URIs <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="redirectURLs"
                  className="w-full px-4 py-3 bg-[#1a1d24] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1773cf] focus:border-transparent resize-y min-h-[120px]"
                  placeholder="https://example.com/callback&#10;https://example.com/auth/callback&#10;http://localhost:3000/callback"
                  required
                />
                <p className="text-sm text-gray-400 mt-1">
                  Enter one URL per line. These are the allowed callback URLs after authentication.
                </p>
              </div>

              <ControlledSelect
                name="tokenEndpointAuthMethod"
                label="Token Endpoint Authentication Method"
                placeholder="Select authentication method"
                required
                options={[
                  { value: "client_secret_basic", label: "Client Secret Basic - HTTP Basic Auth (recommended)" },
                  { value: "client_secret_post", label: "Client Secret Post - POST body parameters" },
                  { value: "none", label: "None - Public client (SPA/Native apps)" },
                ]}
              />

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Grant Types
                </label>
                <input
                  type="text"
                  name="grantTypes"
                  className="w-full px-4 py-3 bg-[#1a1d24] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1773cf] focus:border-transparent"
                  placeholder="authorization_code, refresh_token"
                  defaultValue="authorization_code, refresh_token"
                />
                <p className="text-sm text-gray-400 mt-1">
                  Comma-separated list of allowed OAuth 2.0 grant types
                </p>
              </div>

              <ControlledCheckbox
                name="trusted"
                label="Trusted Client"
                description="Mark as a trusted first-party client (skips consent screen)"
              />

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <SubmitButton variant="primary" leftIcon="add">
                  Register Client
                </SubmitButton>
              </div>
            </FormWrapper>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
