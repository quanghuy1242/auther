import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import { PageHeading, PageContainer } from "@/components/layout";
import { Button } from "@/components/ui";
import { getGroups } from "./actions";
import { GroupsClient } from "./groups-client";

export const metadata: Metadata = {
    title: "Group Management",
    description: "Manage user groups and their permissions",
};

interface GroupsPageProps {
    searchParams: Promise<{
        page?: string;
        search?: string;
    }>;
}

export default async function GroupsPage({ searchParams }: GroupsPageProps) {
    const params = await searchParams;
    const page = parseInt(params.page || "1", 10);
    const search = params.search || "";

    const groupsData = await getGroups({
        page,
        pageSize: 10,
        search,
    });

    return (
        <PageContainer>
            <PageHeading
                title="Group Management"
                description="Manage user groups and their permissions."
                action={
                    <Link href="/admin/groups/create">
                        <Button variant="primary" size="sm" leftIcon="group_add">
                            Create Group
                        </Button>
                    </Link>
                }
            />

            <GroupsClient initialData={groupsData} />
        </PageContainer>
    );
}
