import type { Metadata } from "next";
import { PageHeading, PageContainer } from "@/components/layout";
import { guards } from "@/lib/auth/platform-guard";
import {
    getPendingRequests,
    getAllRequests,
    getAutomationRules,
} from "./actions";
import { RequestsClient } from "./requests-client";

export const metadata: Metadata = {
    title: "Permission Requests",
    description: "Manage permission escalation requests and automation rules",
};

export default async function RequestsPage() {
    // Require platform admin permission
    await guards.platform.admin();

    // Fetch all data in parallel
    const [pendingRequests, allRequests, rules] = await Promise.all([
        getPendingRequests(),
        getAllRequests(),
        getAutomationRules(),
    ]);

    return (
        <PageContainer>
            <PageHeading
                title="Permission Requests"
                description="Review and manage permission escalation requests from users."
            />

            <RequestsClient
                pendingRequests={pendingRequests}
                allRequests={allRequests}
                rules={rules}
            />
        </PageContainer>
    );
}
