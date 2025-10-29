import * as React from "react";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui";
import { getOAuthClients } from "./actions";
import { ClientsClient } from "./clients-client";

export default async function ClientsPage() {
  const clientsData = await getOAuthClients({ page: 1, pageSize: 10 });

  return (
    <>
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
    </>
  );
}
