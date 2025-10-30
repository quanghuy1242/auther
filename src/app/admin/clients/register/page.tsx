"use client";

import * as React from "react";
import { z } from "zod";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, Button, Icon, Badge, UrlListBuilder } from "@/components/ui";
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

const GRANT_TYPES = [
  { value: "authorization_code", label: "Authorization Code", description: "Standard server-side flow" },
  { value: "refresh_token", label: "Refresh Token", description: "Get new access tokens" },
  { value: "client_credentials", label: "Client Credentials", description: "Machine-to-machine auth" },
  { value: "implicit", label: "Implicit", description: "Legacy browser flow (not recommended)" },
  { value: "password", label: "Password", description: "Resource owner password (not recommended)" },
];

function GrantTypesSelector() {
  const [selectedGrants, setSelectedGrants] = React.useState<string[]>(["authorization_code", "refresh_token"]);
  const [grantTypesInput, setGrantTypesInput] = React.useState("authorization_code, refresh_token");

  const toggleGrant = (grantType: string) => {
    const newSelected = selectedGrants.includes(grantType)
      ? selectedGrants.filter(g => g !== grantType)
      : [...selectedGrants, grantType];
    
    setSelectedGrants(newSelected);
    setGrantTypesInput(newSelected.join(", "));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-3">
        Grant Types
      </label>
      <div className="space-y-3">
        {GRANT_TYPES.map((grant) => (
          <label
            key={grant.value}
            className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedGrants.includes(grant.value)}
              onChange={() => toggleGrant(grant.value)}
              className="mt-1 w-4 h-4 rounded border-gray-600 text-[#1773cf] focus:ring-[#1773cf] focus:ring-offset-0 bg-[#1a1d24]"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{grant.label}</span>
                <code className="text-xs text-gray-400 bg-[#1a1d24] px-2 py-0.5 rounded">{grant.value}</code>
              </div>
              <p className="text-xs text-gray-400 mt-1">{grant.description}</p>
            </div>
          </label>
        ))}
      </div>
      <input
        type="hidden"
        name="grantTypes"
        value={grantTypesInput}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-sm text-gray-400">Selected:</span>
        {selectedGrants.length === 0 ? (
          <span className="text-sm text-gray-500">None</span>
        ) : (
          selectedGrants.map((grant) => (
            <Badge key={grant} variant="default">
              {grant}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

export default function RegisterClientPage() {
  const router = useRouter();
  const [clientData, setClientData] = React.useState<{ clientId: string; clientSecret?: string } | null>(null);
  const [copied, setCopied] = React.useState<"id" | "secret" | null>(null);
  const [redirectUrls, setRedirectUrls] = React.useState<string[]>([]);
  const [redirectUrlsInput, setRedirectUrlsInput] = React.useState("");

  // Keep redirectURLs input in sync with the URL list
  React.useEffect(() => {
    setRedirectUrlsInput(redirectUrls.join("\n"));
  }, [redirectUrls]);

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
      <div className="max-w-4xl mx-auto">
        <PageHeading
          title="Client Registered Successfully"
          description="Save these credentials securely - the secret cannot be retrieved again"
        />

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
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeading
        title="Register OAuth Client"
        description="Create a new OAuth 2.0 client application"
      />

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
                <UrlListBuilder
                  urls={redirectUrls}
                  onChange={setRedirectUrls}
                  placeholder="https://example.com/callback"
                  label="Redirect URIs"
                  description="These are the allowed callback URLs after authentication."
                  minUrls={1}
                  validateUrl={true}
                />
                <input
                  type="hidden"
                  name="redirectURLs"
                  value={redirectUrlsInput}
                />
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

              <GrantTypesSelector />

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
  );
}
