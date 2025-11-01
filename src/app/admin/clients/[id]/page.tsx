"use client";

import { ClientDetailClient } from "./client-detail-client";
import { useClient } from "./client-context";

export default function ClientDetailPage() {
  const client = useClient();
  
  return <ClientDetailClient client={client} />;
}
