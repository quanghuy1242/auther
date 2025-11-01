import { notFound } from "next/navigation";
import { getClientById } from "../actions";
import { AccessControlClient } from "./access-control-client";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AccessControlPage({ params }: PageProps) {
  const { id } = await params;
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  return <AccessControlClient client={client} />;
}
