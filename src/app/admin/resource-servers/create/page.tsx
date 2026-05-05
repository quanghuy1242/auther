import type { Metadata } from "next";

import { PageContainer, PageHeading } from "@/components/layout";
import { guards } from "@/lib/auth/platform-guard";
import { ResourceServerForm } from "../resource-server-form";

export const metadata: Metadata = {
  title: "Create Resource Server",
  description: "Create an API audience for resource access tokens.",
};

export default async function CreateResourceServerPage() {
  await guards.platform.admin();

  return (
    <PageContainer maxWidth="4xl">
      <PageHeading
        title="Create Resource Server"
        description="Create the API audience that downstream services validate in access tokens."
      />
      <ResourceServerForm mode="create" />
    </PageContainer>
  );
}
