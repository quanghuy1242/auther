"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Tabs, Button } from "@/components/ui";
import { GroupOverviewTab } from "./tabs/overview-tab";
import { GroupMembersTab } from "./tabs/members-tab";
import { GroupPermissionsTab } from "./tabs/permissions-tab";
import { deleteGroup } from "../actions";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

interface Member {
    id: string;
    name: string;
    email: string;
    image: string | null;
}

interface Permission {
    id: string;
    entityType: string;
    entityId: string;
    relation: string;
    createdAt: Date;
}

interface GroupDetailClientProps {
    group: {
        id: string;
        name: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
    };
    members: Member[];
    permissions: Permission[];
}

export function GroupDetailClient({ group, members, permissions }: GroupDetailClientProps) {
    const router = useRouter();

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this group? This action cannot be undone.")) return;
        try {
            await deleteGroup(group.id);
            toast.success("Group deleted successfully");
            router.push("/admin/groups");
        } catch {
            toast.error("Failed to delete group");
        }
    };

    return (
        <>
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                        <Link href="/admin/groups" className="hover:text-blue-400 transition-colors">
                            Groups
                        </Link>
                        <Icon name="chevron_right" size="sm" />
                        <span className="text-gray-300">{group.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                            <Icon name="group" size="md" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight">{group.name}</h1>
                            <p className="text-sm text-gray-400">{group.description || "No description provided"}</p>
                        </div>
                    </div>
                </div>

                <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDelete}
                    leftIcon="delete"
                >
                    Delete Group
                </Button>
            </div>

            <Tabs
                tabs={[
                    {
                        label: `Overview`,
                        content: <GroupOverviewTab group={group} />,
                    },
                    {
                        label: `Members (${members.length})`,
                        content: <GroupMembersTab groupId={group.id} members={members} />,
                    },
                    {
                        label: `Permissions (${permissions.length})`,
                        content: <GroupPermissionsTab permissions={permissions} />,
                    },
                ]}
            />
        </>
    );
}
