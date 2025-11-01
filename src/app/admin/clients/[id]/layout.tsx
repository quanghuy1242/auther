import { notFound } from "next/navigation";
import { getClientById } from "./actions";
import { ClientDetailTabs } from "./client-detail-tabs";
import { Badge } from "@/components/ui";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{
    id: string;
  }>;
}

export default async function ClientDetailLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Client Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black text-white tracking-tight">
            {client.name || "Unnamed Client"}
          </h1>
          {client.disabled ? (
            <Badge variant="danger" className="rounded-full">Disabled</Badge>
          ) : (
            <Badge variant="success" className="rounded-full">Active</Badge>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <ClientDetailTabs clientId={id} />

      {/* Page Content */}
      {children}
    </div>
  );
}
