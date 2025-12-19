"use client";

import * as React from "react";
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    Modal,
    ModalFooter,
    Icon,
    Input,
    Label,
    Select,
} from "@/components/ui";
import { toast } from "sonner";
import type {
    UserPermissionsData,
    UserPermission,
} from "../permissions-actions";
import {
    revokeUserPermission,
    addUserPermission,
    applyTemplateToUser,
    getPolicyTemplates,
} from "../permissions-actions";
import type { PolicyTemplate } from "@/lib/repositories/platform-access-repository";

interface UserPermissionsTabProps {
    userId: string;
}

export function UserPermissionsTab({ userId }: UserPermissionsTabProps) {
    const [data, setData] = React.useState<UserPermissionsData | null>(null);
    const [templates, setTemplates] = React.useState<PolicyTemplate[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [showAddModal, setShowAddModal] = React.useState(false);
    const [showTemplateModal, setShowTemplateModal] = React.useState(false);
    const [processing, setProcessing] = React.useState<string | null>(null);

    // Add permission form state
    const [permType, setPermType] = React.useState<"platform" | "client">("platform");
    const [relation, setRelation] = React.useState("");
    const [clientId, setClientId] = React.useState("");

    // Load data
    React.useEffect(() => {
        async function load() {
            try {
                const { getUserPermissions } = await import("../permissions-actions");
                const [perms, tmpls] = await Promise.all([
                    getUserPermissions(userId),
                    getPolicyTemplates(),
                ]);
                setData(perms);
                setTemplates(tmpls);
            } catch (error) {
                console.error("Failed to load permissions:", error);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [userId]);

    async function handleRevoke(tupleId: string) {
        setProcessing(tupleId);
        try {
            const result = await revokeUserPermission(userId, tupleId);
            if (result.success) {
                toast.success("Permission revoked");
                // Reload data
                const { getUserPermissions } = await import("../permissions-actions");
                setData(await getUserPermissions(userId));
            } else {
                toast.error(result.error || "Failed to revoke");
            }
        } finally {
            setProcessing(null);
        }
    }

    async function handleAddPermission() {
        if (!relation.trim()) {
            toast.error("Relation is required");
            return;
        }
        if (permType === "client" && !clientId.trim()) {
            toast.error("Client ID is required");
            return;
        }

        setProcessing("add");
        try {
            const result = await addUserPermission(userId, {
                entityType: permType,
                relation: relation.trim(),
                clientId: permType === "client" ? clientId.trim() : undefined,
            });
            if (result.success) {
                toast.success("Permission added");
                setShowAddModal(false);
                resetAddForm();
                // Reload data
                const { getUserPermissions } = await import("../permissions-actions");
                setData(await getUserPermissions(userId));
            } else {
                toast.error(result.error || "Failed to add");
            }
        } finally {
            setProcessing(null);
        }
    }

    async function handleApplyTemplate(templateId: string) {
        setProcessing(templateId);
        try {
            const result = await applyTemplateToUser(userId, templateId);
            if (result.success) {
                toast.success("Template applied");
                setShowTemplateModal(false);
                // Reload data
                const { getUserPermissions } = await import("../permissions-actions");
                setData(await getUserPermissions(userId));
            } else {
                toast.error(result.error || "Failed to apply template");
            }
        } finally {
            setProcessing(null);
        }
    }

    function resetAddForm() {
        setPermType("platform");
        setRelation("");
        setClientId("");
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-neutral-500">Loading permissions...</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-12 text-neutral-500">
                Failed to load permissions
            </div>
        );
    }

    return (
        <>
            <div className="space-y-6">
                {/* Action Buttons */}
                <div className="flex gap-2">
                    <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowAddModal(true)}>
                        Add Permission
                    </Button>
                    <Button variant="secondary" size="sm" leftIcon="content_copy" onClick={() => setShowTemplateModal(true)}>
                        Apply Template
                    </Button>
                </div>

                {/* Platform Permissions */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Icon name="public" className="h-5 w-5" />
                            Platform Permissions
                        </CardTitle>
                        <CardDescription>
                            Global permissions across the platform
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {data.platformPermissions.length > 0 ? (
                            <div className="space-y-2">
                                {data.platformPermissions.map((perm) => (
                                    <PermissionRow
                                        key={perm.id}
                                        permission={perm}
                                        onRevoke={handleRevoke}
                                        processing={processing === perm.id}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-neutral-500">
                                <Icon name="lock_open" className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No platform permissions</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Client Permissions */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Icon name="apps" className="h-5 w-5" />
                            Client Permissions
                        </CardTitle>
                        <CardDescription>
                            Permissions scoped to specific OAuth clients
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {data.clientPermissions.length > 0 ? (
                            <div className="space-y-4">
                                {data.clientPermissions.map((client) => (
                                    <div key={client.clientId} className="border border-neutral-700 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Icon name="key" className="h-4 w-4 text-neutral-500" />
                                            <span className="font-semibold">{client.clientName}</span>
                                            <Badge variant="default" className="text-xs">{client.clientId}</Badge>
                                        </div>
                                        <div className="space-y-2">
                                            {client.permissions.map((perm) => (
                                                <PermissionRow
                                                    key={perm.id}
                                                    permission={perm}
                                                    onRevoke={handleRevoke}
                                                    processing={processing === perm.id}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-neutral-500">
                                <Icon name="apps" className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No client-specific permissions</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Registration Context */}
                {data.registrationContext && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Icon name="how_to_reg" className="h-5 w-5" />
                                Registration Origin
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-neutral-400">
                                This user registered via context: <Badge variant="info">{data.registrationContext}</Badge>
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Add Permission Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => { setShowAddModal(false); resetAddForm(); }}
                title="Add Permission"
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Permission Type</Label>
                        <Select
                            value={permType}
                            onChange={(v) => setPermType(v as "platform" | "client")}
                            options={[
                                { value: "platform", label: "Platform" },
                                { value: "client", label: "Client-specific" },
                            ]}
                        />
                    </div>
                    {permType === "client" && (
                        <div className="space-y-2">
                            <Label htmlFor="client-id">Client ID</Label>
                            <Input
                                id="client-id"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                placeholder="e.g., client_abc123"
                            />
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="relation">Relation</Label>
                        <Input
                            id="relation"
                            value={relation}
                            onChange={(e) => setRelation(e.target.value)}
                            placeholder="e.g., admin, editor, viewer"
                        />
                    </div>
                </div>
                <ModalFooter>
                    <Button variant="secondary" onClick={() => { setShowAddModal(false); resetAddForm(); }}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleAddPermission} disabled={processing === "add"}>
                        {processing === "add" ? "Adding..." : "Add Permission"}
                    </Button>
                </ModalFooter>
            </Modal>

            {/* Apply Template Modal */}
            <Modal
                isOpen={showTemplateModal}
                onClose={() => setShowTemplateModal(false)}
                title="Apply Policy Template"
            >
                <div className="space-y-3">
                    {templates.length > 0 ? (
                        templates.map((template) => (
                            <div
                                key={template.id}
                                className="flex items-center justify-between p-3 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{template.name}</span>
                                        {template.isSystem && <Badge variant="info">System</Badge>}
                                    </div>
                                    {template.description && (
                                        <p className="text-sm text-neutral-500 mt-1">{template.description}</p>
                                    )}
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {template.permissions.map((p, i) => (
                                            <Badge key={i} variant="default" className="text-xs font-mono">
                                                {p.entityType || "platform"}:{p.relation}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleApplyTemplate(template.id)}
                                    disabled={processing === template.id}
                                >
                                    {processing === template.id ? "..." : "Apply"}
                                </Button>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-6 text-neutral-500">
                            No templates available
                        </div>
                    )}
                </div>
                <ModalFooter>
                    <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>
                        Close
                    </Button>
                </ModalFooter>
            </Modal>
        </>
    );
}

// Helper component for permission row
function PermissionRow({
    permission,
    onRevoke,
    processing,
}: {
    permission: UserPermission;
    onRevoke: (id: string) => void;
    processing: boolean;
}) {
    return (
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-800/50">
            <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">
                    {permission.relation}
                </Badge>
                <span className="text-xs text-neutral-500">
                    {permission.createdAt.toLocaleDateString()}
                </span>
            </div>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onRevoke(permission.id)}
                disabled={processing}
            >
                <Icon name="close" className="h-4 w-4 text-red-500" />
            </Button>
        </div>
    );
}
