"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button, Card, CardContent } from "@/components/ui";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { UserGroupPicker, type Group, type User } from "@/components/ui/user-group-picker";
import { addGroupMember, removeGroupMember, getUserGroups } from "@/app/admin/groups/actions";

interface UserGroupsTabProps {
    userId: string;
}

interface UserGroup {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export function UserGroupsTab({ userId }: UserGroupsTabProps) {
    const [groups, setGroups] = useState<UserGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);

    const loadGroups = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getUserGroups(userId);
            setGroups(data as unknown as UserGroup[]);
        } catch (error) {
            console.error("Failed to load user groups:", error);
            toast.error("Failed to load groups");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        loadGroups();
    }, [loadGroups]);

    const handleJoinGroup = async (group: Group | User) => {
        try {
            const result = await addGroupMember(group.id, userId);
            if (result.success) {
                toast.success("Added to group successfully");
                loadGroups();
            } else {
                toast.error(result.error || "Failed to add to group");
            }
        } catch {
            toast.error("Failed to add to group");
        }
    };

    const handleLeaveGroup = async (groupId: string) => {
        if (!confirm("Remove user from this group?")) return;
        try {
            await removeGroupMember(groupId, userId);
            toast.success("Removed from group successfully");
            loadGroups();
        } catch {
            toast.error("Failed to remove from group");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Group Memberships</h3>
                <Button onClick={() => setIsAddGroupOpen(true)} leftIcon="add" size="sm">
                    Join Group
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead>Group Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="w-[150px]">Joined</TableHead>
                                <TableHead className="w-[100px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        Loading...
                                    </TableCell>
                                </TableRow>
                            ) : groups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        User is not a member of any groups.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                groups.map((group) => (
                                    <TableRow key={group.id} className="border-slate-800 hover:bg-slate-800/50">
                                        <TableCell className="font-medium">
                                            <Link
                                                href={`/admin/groups/${group.id}`}
                                                className="hover:underline text-blue-400"
                                            >
                                                {group.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground truncate max-w-[300px]">
                                            {group.description || "-"}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {/* We don't have joinedAt in the group entity returned by getUserGroups yet, defaulting to group creation or need to fetch membership */}
                                            -
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleLeaveGroup(group.id)}
                                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                            >
                                                Leave
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <UserGroupPicker
                isOpen={isAddGroupOpen}
                onClose={() => setIsAddGroupOpen(false)}
                type="group"
                onSelect={handleJoinGroup}
                excludeIds={groups.map(g => g.id)}
                title="Join Group"
            />
        </div>
    );
}
