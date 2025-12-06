import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout";
import { getGroup, getGroupMembers, getGroupPermissions } from "../actions";
import { GroupDetailClient } from "./group-detail-client";

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const group = await getGroup(id);

    if (!group) {
        return {
            title: "Group Not Found",
        };
    }

    return {
        title: `${group.name} - Group Details`,
        description: `Manage "${group.name}" group and its members`,
    };
}

export default async function GroupDetailPage({ params }: PageProps) {
    const { id } = await params;

    const [group, members, permissions] = await Promise.all([
        getGroup(id),
        getGroupMembers(id),
        getGroupPermissions(id),
    ]);

    if (!group) {
        notFound();
    }

    return (
        <PageContainer>
            <GroupDetailClient
                group={group}
                members={members}
                permissions={permissions}
            />
        </PageContainer>
    );
}

