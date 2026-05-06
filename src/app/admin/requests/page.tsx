import type { Metadata } from "next";
import { PageHeading, PageContainer } from "@/components/layout";
import { guards } from "@/lib/auth/platform-guard";
import {
    getPendingRequests,
    getAllRequests,
    getAutomationRules,
    getSpaceRequestTargets,
} from "./actions";
import { userRepository } from "@/lib/repositories";
import { RequestsClient } from "./requests-client";

export const metadata: Metadata = {
    title: "Permission Requests",
    description: "Manage permission escalation requests and automation rules",
};

export default async function RequestsPage() {
    // Require platform admin permission
    await guards.platform.admin();

    // Fetch all data in parallel
    const [pendingRequests, allRequests, rules, requestTargets, usersPage] = await Promise.all([
        getPendingRequests(),
        getAllRequests(),
        getAutomationRules(),
        getSpaceRequestTargets(),
        userRepository.findManyWithAccounts(1, 500),
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
                requestTargets={requestTargets}
                users={usersPage.items.map((user) => ({
                    id: user.id,
                    label: `${user.name || user.email} (${user.email})`,
                }))}
            />
        </PageContainer>
    );
}
