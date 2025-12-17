import type { Metadata } from "next";
import { PageHeading, PageContainer } from "@/components/layout";
import { guards } from "@/lib/auth/platform-guard";
import {
    getPolicyTemplates,
    getAuthorizationModels,
    getClientsWithRegistrationStatus,
    getPlatformContexts,
} from "./actions";
import {
    PolicyTemplatesSection,
    AuthorizationModelsSection,
    ClientWhitelistSection,
    PlatformContextsSection,
} from "./access-client";

export const metadata: Metadata = {
    title: "Access Management",
    description: "Manage platform access control and policy templates",
};

export default async function AccessPage() {
    // Require platform admin permission
    await guards.platform.admin();

    // Fetch all data in parallel
    const [templates, models, clients, contexts] = await Promise.all([
        getPolicyTemplates(),
        getAuthorizationModels(),
        getClientsWithRegistrationStatus(),
        getPlatformContexts(),
    ]);

    return (
        <PageContainer>
            <PageHeading
                title="Access Management"
                description="Manage platform-level access control, authorization models, and policy templates."
            />

            <div className="space-y-6">
                {/* Policy Templates */}
                <PolicyTemplatesSection templates={templates} models={models} />

                {/* Authorization Models */}
                <AuthorizationModelsSection models={models} />

                {/* Client Registration Whitelist */}
                <ClientWhitelistSection clients={clients} />

                {/* Platform Registration Contexts */}
                <PlatformContextsSection contexts={contexts} models={models} />
            </div>
        </PageContainer>
    );
}
