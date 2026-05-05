import type { Metadata } from "next";

import { PageContainer, PageHeading } from "@/components/layout";
import { guards } from "@/lib/auth/platform-guard";
import { resourceServerRepository } from "@/lib/repositories";
import { AuthorizationSpaceForm } from "../authorization-space-form";

export const metadata: Metadata = {
  title: "Create Authorization Space",
  description: "Create a model and grant ownership boundary.",
};

export default async function CreateAuthorizationSpacePage() {
  await guards.platform.admin();
  const resourceServers = await resourceServerRepository.findAll();

  return (
    <PageContainer maxWidth="4xl">
      <PageHeading
        title="Create Authorization Space"
        description="Create the resource boundary where authorization models and grants are owned."
      />
      <AuthorizationSpaceForm mode="create" resourceServers={resourceServers} />
    </PageContainer>
  );
}
