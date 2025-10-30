import { notFound } from "next/navigation";
import { getClientById } from "./actions";
import { ClientDetailClient } from "./client-detail-client";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto">
      <ClientDetailClient client={client} />
    </div>
  );
}
