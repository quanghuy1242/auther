import type { Metadata } from "next";
import * as React from "react";
import { PageHeading, PageContainer } from "@/components/layout";
import { getJwksKeys } from "./actions";
import { KeysClient } from "./keys-client";

export const metadata: Metadata = {
  title: "JWKS Key Management",
  description: "Manage JSON Web Key Sets for token signing",
};

export default async function KeysPage() {
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
