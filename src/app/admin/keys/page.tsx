import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { getJwksKeys } from "./actions";
import { KeysClient } from "./keys-client";

export default async function KeysPage() {
  const keys = await getJwksKeys();

  return (
    <>
      <PageHeading
        title="JWKS Key Management"
        description="Manage JSON Web Key Sets for token signing"
      />
      <KeysClient initialKeys={keys} />
    </>
  );
}
