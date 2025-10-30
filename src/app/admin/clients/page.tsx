import * as React from "react";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui";
import { getOAuthClients } from "./actions";
import { ClientsClient } from "./clients-client";

interface ClientsPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    type?: string;
  }>;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const search = params.search || "";
  const type = params.type === "trusted" || params.type === "dynamic" ? params.type : null;

  const clientsData = await getOAuthClients({
    page,
    pageSize: 10,
    search,
    type,
  });

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeading
        title="OAuth Client Management"
        description="Manage trusted and dynamically registered OAuth clients."
        action={
          <Link href="/admin/clients/register">
            <Button variant="primary" leftIcon="add">
              Register New Client
            </Button>
          </Link>
        }
      />

      <ClientsClient initialData={clientsData} />
    </div>
  );
}
