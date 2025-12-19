import type { Metadata } from "next";
import * as React from "react";
import { PageHeading, PageContainer } from "@/components/layout";
import { getJwksKeys } from "./actions";
import { KeysClient } from "./keys-client";
import { guards } from "@/lib/auth/platform-guard";

export const metadata: Metadata = {
  title: "JWKS Key Management",
  description: "Manage JSON Web Key Sets for token signing",
};

export default async function KeysPage() {
  // Require keys:view permission
  await guards.keys.view();

  const keys = await getJwksKeys();

  return (
    <PageContainer>
      <PageHeading
        title="JWKS Key Management"
        description="Manage JSON Web Key Sets for token signing"
      />
      <KeysClient initialKeys={keys} />
    </PageContainer>
  );
}
