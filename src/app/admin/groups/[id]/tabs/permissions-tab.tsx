"use client";

import * as React from "react";
import { ResponsiveTable, Badge } from "@/components/ui";
import { formatDateShort } from "@/lib/utils/date-formatter";

interface Permission {
    id: string;
    entityType: string;
    entityId: string;
    relation: string;
    createdAt: Date;
}

interface GroupPermissionsTabProps {
    permissions: Permission[];
}

export function GroupPermissionsTab({ permissions }: GroupPermissionsTabProps) {
    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-border-dark">
                <ResponsiveTable
                    columns={[
                        {
                            key: "entityType",
                            header: "Resource Type",
                            render: (p) => <span className="font-mono text-sm text-blue-300">{p.entityType}</span>,
                        },
                        {
                            key: "entityId",
                            header: "Resource ID",
                            render: (p) => <span className="font-mono text-sm text-gray-400">{p.entityId}</span>,
                        },
                        {
                            key: "relation",
                            header: "Role (Relation)",
                            render: (p) => (
                                <span className="inline-flex items-center rounded-md bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20">
                                    {p.relation}
                                </span>
                            ),
                        },
                        {
                            key: "createdAt",
                            header: "Granted At",
                            render: (p) => <span className="text-sm text-gray-400">{formatDateShort(p.createdAt)}</span>,
                        },
                    ]}
                    data={permissions}
                    keyExtractor={(p) => p.id}
                    mobileCardRender={(p) => (
                        <div className="p-4 border border-border-dark rounded-lg space-y-2 bg-card">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-blue-300 uppercase tracking-wider">{p.entityType}</p>
                                    <p className="font-mono text-sm text-white mt-1">{p.entityId}</p>
                                </div>
                                <span className="inline-flex items-center rounded-md bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20">
                                    {p.relation}
                                </span>
                            </div>
                            <div className="text-xs text-gray-500 pt-2">
                                Granted {formatDateShort(p.createdAt)}
                            </div>
                        </div>
                    )}
                    emptyMessage="No direct permissions granted to this group."
                />
            </div>
            <p className="text-sm text-gray-500 text-center">
                To grant permissions, navigate to the specific resource (e.g. Client) and add this group in the Access Control tab.
            </p>
        </div>
    );
}
