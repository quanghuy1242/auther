import type { Metadata } from "next";
import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { getJwksKeys } from "./actions";
import { KeysClient } from "./keys-client";

export const metadata: Metadata = {
  title: "JWKS Key Management",
  description: "Manage JSON Web Key Sets for token signing",
};

export default async function KeysPage() {
  const keys = await getJwksKeys();

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeading
        title="JWKS Key Management"
        description="Manage JSON Web Key Sets for token signing"
      />
      <KeysClient initialKeys={keys} />
    </div>
  );
}
