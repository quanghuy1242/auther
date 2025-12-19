import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import { PageHeading, PageContainer } from "@/components/layout";
import { Button } from "@/components/ui";
import { getOAuthClients } from "./actions";
import { ClientsClient } from "./clients-client";
import { guards } from "@/lib/auth/platform-guard";

export const metadata: Metadata = {
  title: "OAuth Client Management",
  description: "Manage trusted and dynamically registered OAuth clients",
};

interface ClientsPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    type?: string;
  }>;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  // Require clients:view permission
  await guards.clients.view();

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
    <PageContainer>
      <PageHeading
        title="OAuth Client Management"
        description="Manage trusted and dynamically registered OAuth clients."
        action={
          <Link href="/admin/clients/register">
            <Button variant="primary" size="sm" leftIcon="add">
              Register New Client
            </Button>
          </Link>
        }
      />

      <ClientsClient initialData={clientsData} />
    </PageContainer>
  );
}
