import { notFound } from "next/navigation";
import { getClientById } from "../actions";
import { ApiKeysClient } from "./api-keys-client";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ApiKeysPage({ params }: PageProps) {
  const { id } = await params;
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  return <ApiKeysClient client={client} />;
}
