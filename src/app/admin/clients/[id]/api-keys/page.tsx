"use client";

import { ApiKeysClient } from "./api-keys-client";
import { useClient } from "../client-context";

export default function ApiKeysPage() {
  const client = useClient();
  
  return <ApiKeysClient client={client} />;
}

