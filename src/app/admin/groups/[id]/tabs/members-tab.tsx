"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, ResponsiveTable } from "@/components/ui";
import { UserGroupPicker, type User, type Group } from "@/components/ui/user-group-picker";
import { addGroupMember, removeGroupMember } from "../../actions";
import { toast } from "@/lib/toast";

interface Member {
    id: string;
    name: string;
    email: string;
    image: string | null;
}

interface GroupMembersTabProps {
    groupId: string;
    members: Member[];
}

export function GroupMembersTab({ groupId, members }: GroupMembersTabProps) {
    const router = useRouter();
    const [isAddMemberOpen, setIsAddMemberOpen] = React.useState(false);

    const handleAddMember = async (selected: User | Group) => {
        try {
            const user = selected as User;
            const result = await addGroupMember(groupId, user.id);
            if (result.success) {
                toast.success("Member added successfully");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to add member");
            }
        } catch {
            toast.error("Failed to add member");
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!confirm("Are you sure you want to remove this user from the group?")) return;
        try {
            await removeGroupMember(groupId, userId);
            toast.success("Member removed successfully");
            router.refresh();
        } catch {
            toast.error("Failed to remove member");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={() => setIsAddMemberOpen(true)} leftIcon="add" size="sm">
                    Add Member
                </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-border-dark">
                <ResponsiveTable
                    columns={[
                        {
                            key: "user",
                            header: "User",
                            render: (m) => (
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-8 h-8 rounded-full bg-slate-700 bg-cover bg-center"
                                        style={{ backgroundImage: `url(${m.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.name}`})` }}
                                    />
                                    <span className="font-medium text-white">{m.name}</span>
                                </div>
                            ),
                        },
                        {
                            key: "email",
                            header: "Email",
                            render: (m) => <span className="text-gray-400">{m.email}</span>,
                        },
                        {
                            key: "actions",
                            header: "Actions",
                            render: (m) => (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveMember(m.id)}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                >
                                    Remove
                                </Button>
                            ),
                            className: "text-right",
                        },
                    ]}
                    data={members}
                    keyExtractor={(m) => m.id}
                    mobileCardRender={(m) => (
                        <div className="p-4 border border-border-dark rounded-lg space-y-3 bg-card">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center"
                                    style={{ backgroundImage: `url(${m.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.name}`})` }}
                                />
                                <div>
                                    <p className="font-medium text-white">{m.name}</p>
                                    <p className="text-sm text-gray-400">{m.email}</p>
                                </div>
                            </div>
                            <div className="flex justify-end pt-2 border-t border-border-dark">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveMember(m.id)}
                                    className="text-red-400 hover:text-red-300 w-full justify-center"
                                >
                                    Remove Member
                                </Button>
                            </div>
                        </div>
                    )}
                    emptyMessage="No members in this group"
                />
            </div>

            <UserGroupPicker
                isOpen={isAddMemberOpen}
                onClose={() => setIsAddMemberOpen(false)}
                type="user"
                onSelect={handleAddMember}
                excludeIds={members.map(m => m.id)}
                title="Add Member to Group"
            />
        </div>
    );
}
