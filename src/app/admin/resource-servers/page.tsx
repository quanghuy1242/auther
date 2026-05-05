import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeading } from "@/components/layout";
import { Button } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import { resourceServerRepository } from "@/lib/repositories";
import { ResourceServersClient } from "./resource-servers-client";

export const metadata: Metadata = {
  title: "Resource Servers",
  description: "Manage resource server audiences.",
};

export default async function ResourceServersPage() {
  await guards.platform.admin();
  const resourceServers = await resourceServerRepository.findAll();

  return (
    <PageContainer>
      <PageHeading
        title="Resource Servers"
        description="Define API audiences separately from OAuth clients. Resource servers are what access tokens are issued for and what APIs validate."
        action={
          <Link href="/admin/resource-servers/create">
            <Button variant="primary" size="sm" leftIcon="add">
              Create Resource Server
            </Button>
          </Link>
        }
      />

      <ResourceServersClient resourceServers={resourceServers} />
    </PageContainer>
  );
}
