"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Button, ResponsiveTable, SearchInput, Pagination } from "@/components/ui";
import { FilterBar } from "@/components/admin";
import { formatDateShort } from "@/lib/utils/date-formatter";
import type { GetGroupsResult } from "./actions";

interface GroupsClientProps {
    initialData: GetGroupsResult;
}

export function GroupsClient({ initialData }: GroupsClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = React.useTransition();

    const handleSearch = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        const currentSearch = params.get("search") || "";

        // Avoid redundant navigation
        if (value === currentSearch) return;

        if (value) {
            params.set("search", value);
        } else {
            params.delete("search");
        }
        params.set("page", "1"); // Reset to page 1 on search
        startTransition(() => {
            router.push(`/admin/groups?${params.toString()}`);
        });
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", newPage.toString());
        startTransition(() => {
            router.push(`/admin/groups?${params.toString()}`);
        });
    };

    return (
        <>
            {/* Control Bar */}
            <FilterBar>
                <div className="relative flex-grow min-w-full sm:min-w-[300px]">
                    <SearchInput
                        placeholder="Search by name or description..."
                        defaultValue={searchParams.get("search") || ""}
                        onSearch={handleSearch}
                        className="w-full"
                    />
                </div>
            </FilterBar>

            {/* Responsive Table */}
            <div className="overflow-hidden rounded-lg border-0 sm:border sm:border-border-dark">
                <ResponsiveTable
                    columns={[
                        {
                            key: "name",
                            header: "Name",
                            render: (group) => (
                                <Link
                                    href={`/admin/groups/${group.id}`}
                                    className="font-medium text-blue-400 hover:underline"
                                >
                                    {group.name}
                                </Link>
                            ),
                        },
                        {
                            key: "description",
                            header: "Description",
                            render: (group) => (
                                <span className="text-sm text-gray-400 truncate max-w-[300px] block">
                                    {group.description || "-"}
                                </span>
                            ),
                        },
                        {
                            key: "memberCount",
                            header: "Members",
                            render: (group) => (
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <Icon name="group" size="sm" className="text-slate-500" />
                                    {group.memberCount}
                                </div>
                            ),
                        },
                        {
                            key: "createdAt",
                            header: "Created",
                            render: (group) => (
                                <span className="text-sm text-gray-400">{formatDateShort(group.createdAt)}</span>
                            ),
                        },
                        {
                            key: "actions",
                            header: "Actions",
                            render: (group) => (
                                <Link
                                    href={`/admin/groups/${group.id}`}
                                    className="text-[#1773cf] hover:text-[#1773cf]/80"
                                >
                                    <Icon name="more_horiz" />
                                </Link>
                            ),
                            className: "text-right",
                        },
                    ]}
                    data={initialData.groups}
                    keyExtractor={(group) => group.id}
                    mobileCardRender={(group) => (
                        <div className="rounded-lg p-4 border border-border-dark sm:border-0 space-y-3 bg-card">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-medium text-white">{group.name}</p>
                                    <p className="text-xs text-gray-400 mt-1">{group.description || "No description"}</p>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-gray-400 bg-slate-800 px-2 py-1 rounded">
                                    <Icon name="group" size="sm" />
                                    {group.memberCount}
                                </div>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-border-dark">
                                <div className="text-xs text-gray-500">
                                    Created {formatDateShort(group.createdAt)}
                                </div>
                                <Link
                                    href={`/admin/groups/${group.id}`}
                                    className="inline-flex items-center gap-1 text-[#1773cf] hover:text-[#1773cf]/80 text-sm min-h-[44px] px-3"
                                >
                                    View <Icon name="chevron_right" size="sm" />
                                </Link>
                            </div>
                        </div>
                    )}
                    emptyMessage="No groups found"
                />
            </div>

            {/* Pagination */}
            <Pagination
                currentPage={initialData.page}
                pageSize={initialData.pageSize}
                totalItems={initialData.total}
                totalPages={initialData.totalPages}
                onPageChange={handlePageChange}
                isPending={isPending}
            />
        </>
    );
}
