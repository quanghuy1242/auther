"use client";

import * as React from "react";
import {
    Button,
    Badge,
    Switch,
    Modal,
    ModalFooter,
    Icon,
    Input,
    Label,
    Textarea,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    EmptyState,
    Select,
} from "@/components/ui";

import { toast } from "sonner";
import type {
    RegistrationContext,
    PermissionRequest,
} from "./registration-actions";
import {
    createClientContext,
    toggleClientContext,
    deleteClientContext,
    approveClientRequest,
    rejectClientRequest,
} from "./registration-actions";

// ============================================================================
// Registration Tab
// ============================================================================

interface RegistrationTabProps {
    clientId: string;
    contexts: RegistrationContext[];
    allowsContexts: boolean;
    entityTypes: Array<{ id: string; name: string; relations: string[] }>;
}

export function RegistrationTab({ clientId, contexts, allowsContexts, entityTypes }: RegistrationTabProps) {
    const [showCreate, setShowCreate] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [updating, setUpdating] = React.useState<string | null>(null);

    // Form state
    const [slug, setSlug] = React.useState("");
    const [name, setName] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [originsText, setOriginsText] = React.useState("");
    const [grants, setGrants] = React.useState<Array<{ entityTypeId: string; relation: string }>>([]);;

    async function handleCreate() {
        if (!slug.trim()) {
            toast.error("Slug is required");
            return;
        }
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        if (grants.length === 0) {
            toast.error("At least one grant is required");
            return;
        }

        setCreating(true);
        try {
            const allowedOrigins = originsText.split("\n").map(s => s.trim()).filter(Boolean);
            const result = await createClientContext(clientId, {
                slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
                name: name.trim(),
                description: description.trim() || undefined,
                allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
                grants,
            });
            if (result.success) {
                toast.success("Context created");
                setShowCreate(false);
                resetForm();
            } else {
                toast.error(result.error || "Failed to create context");
            }
        } finally {
            setCreating(false);
        }
    }

    async function handleToggle(contextId: string, currentEnabled: boolean) {
        setUpdating(contextId);
        try {
            const result = await toggleClientContext(clientId, contextId, !currentEnabled);
            if (result.success) {
                toast.success(currentEnabled ? "Context disabled" : "Context enabled");
            } else {
                toast.error(result.error || "Failed to update");
            }
        } finally {
            setUpdating(null);
        }
    }

    async function handleDelete(contextId: string) {
        if (!confirm("Are you sure you want to delete this context?")) return;

        const result = await deleteClientContext(clientId, contextId);
        if (result.success) {
            toast.success("Context deleted");
        } else {
            toast.error(result.error || "Failed to delete");
        }
    }

    function resetForm() {
        setSlug("");
        setName("");
        setDescription("");
        setOriginsText("");
        setGrants([]);
    }

    function addGrant() {
        // Start with empty entityTypeId and relation - user will select from dropdown
        setGrants([...grants, { entityTypeId: "", relation: "" }]);
    }

    function removeGrant(idx: number) {
        setGrants(grants.filter((_, i) => i !== idx));
    }

    function updateGrant(idx: number, entityTypeId: string, relation: string) {
        const updated = [...grants];
        updated[idx] = { entityTypeId, relation };
        setGrants(updated);
    }

    // Build flat options for Select: value = "entityTypeId:relation", label = "name → relation"
    const grantOptions = React.useMemo(() => {
        const options: Array<{ value: string; label: string }> = [];
        for (const et of entityTypes) {
            for (const rel of et.relations) {
                options.push({
                    value: `${et.id}:${rel}`,  // Use ID for stable references
                    label: `${et.name} → ${rel}`,  // Show name for display
                });
            }
        }
        return options;
    }, [entityTypes]);

    if (!allowsContexts) {
        return (
            <Card>
                <CardHeader className="border-b border-[#243647] pb-6">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                                <Icon name="block" size="xs" className="h-5 w-5 text-gray-400" />
                                Registration Contexts
                            </CardTitle>
                            <CardDescription className="text-sm text-gray-400 mt-1">Registration contexts are disabled for this client</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 flex flex-col gap-6">
                    <EmptyState
                        icon="block"
                        title="Registration Contexts Disabled"
                        description={
                            <>
                                This client is not whitelisted for registration contexts.
                                <br />
                                Contact a platform administrator to enable this feature.
                            </>
                        }
                    />
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader className="border-b border-[#243647] pb-6 flex-row items-start justify-between space-y-0">
                    <div className="flex flex-1 items-center gap-4">
                        <div className="flex-1">
                            <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                                <Icon name="person_add" size="xs" className="h-5 w-5 text-gray-400" />
                                Registration Contexts
                            </CardTitle>
                            <CardDescription className="text-sm text-gray-400 mt-1">Sign-up flows that grant client-level permissions</CardDescription>
                        </div>
                    </div>
                    <div className="pl-4 flex items-center">
                        <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowCreate(true)}>
                            Create Context
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 flex flex-col gap-6">
                    {contexts.length > 0 ? (
                        <div className="space-y-3">
                            {contexts.map((context) => (
                                <div
                                    key={context.id}
                                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold">{context.name}</span>
                                                <Badge variant={context.enabled ? "success" : "default"}>
                                                    {context.enabled ? "Active" : "Inactive"}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-neutral-500 font-mono">
                                                /{context.slug}
                                            </p>
                                            {context.description && (
                                                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                                    {context.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={context.enabled ?? false}
                                                onChange={() => handleToggle(context.slug, context.enabled ?? false)}
                                                disabled={updating === context.slug}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(context.slug)}
                                            >
                                                <Icon name="delete" className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Context Details */}
                                    <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-700 space-y-2">
                                        {/* Grants */}
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-neutral-500">Grants:</span>
                                            <div className="flex flex-wrap gap-1">
                                                {context.grants.map((grant, idx) => (
                                                    <Badge key={idx} variant="default" className="text-xs font-mono">
                                                        {grant.relation}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Allowed Origins */}
                                        {context.allowedOrigins && context.allowedOrigins.length > 0 && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="text-neutral-500">Origins:</span>
                                                <span className="text-neutral-600 dark:text-neutral-400">
                                                    {context.allowedOrigins.join(", ")}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon="person_add"
                            title="No registration contexts"
                            description="Create contexts to enable user sign-up for this client"
                        />
                    )}
                </CardContent>
            </Card >

            {/* Create Context Modal */}
            < Modal
                isOpen={showCreate}
                onClose={() => { setShowCreate(false); resetForm(); }
                }
                title="Create Registration Context"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="context-name">Name</Label>
                            <Input
                                id="context-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Standard User"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="context-slug">Slug</Label>
                            <Input
                                id="context-slug"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="e.g., standard-user"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="context-desc">Description</Label>
                        <Textarea
                            id="context-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What this context is used for..."
                            rows={2}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="context-origins">Allowed Origins (one per line)</Label>
                        <Textarea
                            id="context-origins"
                            value={originsText}
                            onChange={(e) => setOriginsText(e.target.value)}
                            placeholder="https://example.com&#10;https://app.example.com"
                            rows={2}
                        />
                        <p className="text-xs text-neutral-500">Leave empty for invite-only contexts</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Permission Grants</Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                leftIcon="add"
                                onClick={addGrant}
                                disabled={grantOptions.length === 0}
                            >
                                Add
                            </Button>
                        </div>
                        {grantOptions.length === 0 ? (
                            <p className="text-sm text-amber-500 text-center py-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                No authorization model configured. Define relations in the Access Control tab first.
                            </p>
                        ) : grants.length === 0 ? (
                            <p className="text-sm text-neutral-500 text-center py-4">
                                No grants added yet
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {grants.map((grant, idx) => {
                                    const selectedValue = grant.entityTypeId && grant.relation
                                        ? `${grant.entityTypeId}:${grant.relation}`
                                        : "";
                                    return (
                                        <div key={idx} className="flex items-center gap-2">
                                            <Select
                                                value={selectedValue}
                                                onChange={(value) => {
                                                    // Parse "entityTypeId:relation" value back to components
                                                    const [entityTypeId, relation] = value.split(":");
                                                    updateGrant(idx, entityTypeId, relation);
                                                }}
                                                placeholder="Select entity type → relation..."
                                                options={grantOptions}
                                                className="flex-1"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => removeGrant(idx)}
                                            >
                                                <Icon name="close" size="xs" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-xs text-neutral-500">
                            Select entity type and relation pairs from the authorization model
                        </p>
                    </div>
                </div>
                <ModalFooter>
                    <Button variant="secondary" onClick={() => { setShowCreate(false); resetForm(); }}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleCreate} disabled={creating}>
                        {creating ? "Creating..." : "Create Context"}
                    </Button>
                </ModalFooter>
            </Modal >
        </>
    );
}

// ============================================================================
// Requests Tab
// ============================================================================

interface RequestsTabProps {
    clientId: string;
    requests: PermissionRequest[];
}

export function RequestsTab({ clientId, requests }: RequestsTabProps) {
    const [processing, setProcessing] = React.useState<string | null>(null);

    async function handleApprove(requestId: string) {
        setProcessing(requestId);
        try {
            const result = await approveClientRequest(clientId, requestId);
            if (result.success) {
                toast.success("Request approved");
            } else {
                toast.error(result.error || "Failed to approve");
            }
        } finally {
            setProcessing(null);
        }
    }

    async function handleReject(requestId: string) {
        setProcessing(requestId);
        try {
            const result = await rejectClientRequest(clientId, requestId);
            if (result.success) {
                toast.success("Request rejected");
            } else {
                toast.error(result.error || "Failed to reject");
            }
        } finally {
            setProcessing(null);
        }
    }

    const pendingRequests = requests.filter(r => r.status === "pending");

    return (
        <Card>
            <CardHeader className="border-b border-[#243647] pb-6">
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                            <Icon name="pending_actions" size="xs" className="h-5 w-5 text-gray-400" />
                            <span className="flex items-center gap-2">
                                Permission Requests
                                {pendingRequests.length > 0 && (
                                    <Badge variant="warning">{pendingRequests.length}</Badge>
                                )}
                            </span>
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-400 mt-1">Permission escalation requests for this client</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col gap-6">
                {pendingRequests.length > 0 ? (
                    <div className="space-y-3">
                        {pendingRequests.map((request) => (
                            <div
                                key={request.id}
                                className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-900/20 p-4"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Icon name="person" className="h-4 w-4 text-neutral-500" />
                                            <span className="font-medium">
                                                {request.userId}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-neutral-500">Requesting:</span>
                                            <Badge variant="default" className="font-mono">
                                                {request.relation}
                                            </Badge>
                                        </div>
                                        {request.reason && (
                                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                                                &ldquo;{request.reason}&rdquo;
                                            </p>
                                        )}
                                        <p className="text-xs text-neutral-500">
                                            Requested {request.requestedAt.toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleReject(request.id)}
                                            disabled={processing === request.id}
                                        >
                                            <Icon name="close" className="h-4 w-4 text-red-500" />
                                        </Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => handleApprove(request.id)}
                                            disabled={processing === request.id}
                                        >
                                            {processing === request.id ? "..." : "Approve"}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon="check_circle"
                        title="No pending requests"
                        description="All permission requests have been processed"
                    />
                )}
            </CardContent>
        </Card>
    );
}
