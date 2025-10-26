import type { Metadata } from "next";
import Link from "next/link";

import { EmailSignInForm } from "@/components/auth/email-sign-in-form";
import { env } from "@/env";

export const metadata: Metadata = {
  title: "Sign in",
};

const authorizationEndpoint = "/api/auth/oauth2/authorize";
const tokenEndpoint = "/api/auth/oauth2/token";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-16 text-white">
      <div className="w-full max-w-md space-y-10 rounded-2xl border border-gray-800/70 bg-gray-900/70 p-10 shadow-2xl shadow-black/40 backdrop-blur">
        <header className="space-y-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Better Auth</h1>
          <p className="text-sm text-gray-400">
            This service powers Payload SSO. Use your Better Auth credentials or any configured
            provider to continue.
          </p>
        </header>

        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-300">Email</h2>
            <EmailSignInForm />
          </div>

          <div className="space-y-2 rounded-lg border border-gray-800/80 bg-gray-900/50 p-4 text-xs text-gray-400">
            <p className="font-medium text-gray-200">OIDC endpoints</p>
            <ul className="space-y-1">
              <li>
                Authorize:{" "}
                <code className="break-words text-[11px]">
                  {`${env.JWT_ISSUER.replace(/\/$/, "")}${authorizationEndpoint}`}
                </code>
              </li>
              <li>
                Token:{" "}
                <code className="break-words text-[11px]">
                  {`${env.JWT_ISSUER.replace(/\/$/, "")}${tokenEndpoint}`}
                </code>
              </li>
              <li>
                JWKS:{" "}
                <code className="break-words text-[11px]">
                  {`${env.JWT_ISSUER.replace(/\/$/, "")}/oauth2/jwks`}
                </code>
              </li>
            </ul>
            <p className="pt-2">
              SPA redirect URIs ({env.PAYLOAD_SPA_REDIRECT_URIS.length}):{" "}
              {env.PAYLOAD_SPA_REDIRECT_URIS.join(", ")}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-800/80 bg-gray-900/50 p-4 text-xs text-gray-400">
            <p className="font-medium text-gray-200">Payload admin callback</p>
            <code className="block break-words text-[11px]">{env.PAYLOAD_REDIRECT_URI}</code>
            <Link
              href={`${authorizationEndpoint}?client_id=${encodeURIComponent(env.PAYLOAD_CLIENT_ID)}&redirect_uri=${encodeURIComponent(env.PAYLOAD_REDIRECT_URI)}&response_type=code&scope=openid%20profile%20email`}
              className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-xs font-medium text-black transition hover:bg-gray-200"
            >
              Start admin SSO test
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

