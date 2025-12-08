import type { Metadata } from "next";
import { PageHeading, PageContainer } from "@/components/layout";
import { getScripts, getPipelineConfig, getSecrets } from "./actions";
import { SwimlaneEditor } from "@/components/admin/pipelines/swimlane-editor";
import { SecretsManager } from "@/components/admin/pipelines/secrets-manager";
import { Tabs } from "@/components/ui/tabs";

export const metadata: Metadata = {
    title: "Pipelines",
    description: "Visual editor for authentication pipeline flows",
};

export default async function PipelinesPage() {
    // Fetch initial data from server
    const [scripts, config, secrets] = await Promise.all([
        getScripts(),
        getPipelineConfig(),
        getSecrets(),
    ]);

    const tabs = [
        {
            label: "Editor",
            icon: "account_tree",
            content: (
                <SwimlaneEditor
                    initialScripts={scripts}
                    initialConfig={config}
                />
            ),
        },
        {
            label: "Secrets",
            icon: "key",
            content: <SecretsManager initialSecrets={secrets} />,
        },
    ];

    return (
        <PageContainer>
            <PageHeading
                title="Pipelines"
                description="Configure authentication flows with visual scripting"
            />

            <Tabs tabs={tabs} />
        </PageContainer>
    );
}

