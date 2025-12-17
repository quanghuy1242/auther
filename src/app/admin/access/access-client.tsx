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
    EmptyState,
} from "@/components/ui";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { toast } from "sonner";
import type {
    PolicyTemplate,
    AuthorizationModel,
    ClientWithRegistrationStatus,
    RegistrationContext,
} from "./actions";
import {
    createPolicyTemplate,
    deletePolicyTemplate,
    toggleClientRegistrationContexts,
    toggleContextEnabled,
    deleteContext,
    createPlatformContext,
    createAuthorizationModel,
    deleteAuthorizationModel,
} from "./actions";

// ============================================================================
// Policy Templates Section
// ============================================================================

interface PolicyTemplatesSectionProps {
    templates: PolicyTemplate[];
    models: AuthorizationModel[];
}

export function PolicyTemplatesSection({ templates, models }: PolicyTemplatesSectionProps) {
    const [selectedTemplate, setSelectedTemplate] = React.useState<PolicyTemplate | null>(null);
    const [showCreate, setShowCreate] = React.useState(false);
    const [creating, setCreating] = React.useState(false);

    // Form state
    const [name, setName] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [permissions, setPermissions] = React.useState<Array<{ entityType: string; relation: string }>>([]);

    async function handleDelete(id: string) {
        const result = await deletePolicyTemplate(id);
        if (result.success) {
            toast.success("Template deleted");
        } else {
            toast.error(result.error || "Failed to delete template");
        }
    }

    async function handleCreate() {
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        if (permissions.length === 0) {
            toast.error("At least one permission is required");
            return;
        }

        setCreating(true);
        try {
            const result = await createPolicyTemplate({
                name: name.trim(),
                description: description.trim() || undefined,
                permissions,
            });
            if (result.success) {
                toast.success("Template created");
                setShowCreate(false);
                resetForm();
            } else {
                toast.error(result.error || "Failed to create template");
            }
        } finally {
            setCreating(false);
        }
    }

    function resetForm() {
        setName("");
        setDescription("");
        setPermissions([]);
    }

    function addPermission() {
        setPermissions([...permissions, { entityType: "", relation: "" }]);
    }

    function removePermission(idx: number) {
        setPermissions(permissions.filter((_, i) => i !== idx));
    }

    function updatePermission(idx: number, field: "entityType" | "relation", value: string) {
        const updated = [...permissions];
        updated[idx] = { ...updated[idx], [field]: value };
        setPermissions(updated);
    }

    const systemTemplates = templates.filter(t => t.isSystem);
    const customTemplates = templates.filter(t => !t.isSystem);

    return (
        <CollapsibleSection
            title="Policy Templates"
            icon="shield"
            description="Pre-configured permission bundles that can be applied to users"
            defaultOpen
            actions={
                <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowCreate(true)}>
                    Create Template
                </Button>
            }
        >
                {/* System Templates */}
                {systemTemplates.length > 0 && (
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-2">System Templates</h4>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {systemTemplates.map((template) => (
                                <div
                                    key={template.id}
                                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800 cursor-pointer hover:border-neutral-300 dark:hover:border-neutral-600"
                                    onClick={() => setSelectedTemplate(template)}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon name="verified" size="xs" className="h-4 w-4 text-blue-500" />
                                        <span className="font-medium">{template.name}</span>
                                    </div>
                                    <Badge variant="default">
                                        {template.permissions.length} permissions
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Custom Templates */}
                {customTemplates.length > 0 && (
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-2">Custom Templates</h4>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {customTemplates.map((template) => (
                                <div
                                    key={template.id}
                                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800 cursor-pointer hover:border-neutral-300 dark:hover:border-neutral-600 group"
                                    onClick={() => setSelectedTemplate(template)}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon name="description" size="xs" className="h-4 w-4 text-neutral-500" />
                                        <span className="font-medium">{template.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="default">
                                            {template.permissions.length}
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(template.id);
                                            }}
                                        >
                                            <Icon name="delete" size="xs" className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {templates.length === 0 && (
                    <EmptyState
                        icon="shield"
                        title="No policy templates yet"
                        description="Create templates to quickly assign permissions"
                    />
                )}

                {/* Template Detail Modal */}
                <Modal
                    isOpen={!!selectedTemplate}
                    onClose={() => setSelectedTemplate(null)}
                    title={selectedTemplate?.name || "Template Details"}
                >
                    <div className="space-y-4">
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                            {selectedTemplate?.description || "No description"}
                        </p>
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium">Permissions Granted:</h4>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                {selectedTemplate?.permissions.map((perm, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-2 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 px-3 py-2"
                                    >
                                        <span className="font-mono text-xs bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
                                            {perm.entityType}
                                        </span>
                                        <Icon name="arrow_forward" className="text-[12px] h-3 w-3 text-neutral-400" />
                                        <span className="font-medium">{perm.relation}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Modal>

                {/* Create Template Modal */}
                <Modal
                    isOpen={showCreate}
                    onClose={() => { setShowCreate(false); resetForm(); }}
                    title="Create Policy Template"
                >
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="template-name">Name</Label>
                            <Input
                                id="template-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Support Agent"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="template-desc">Description</Label>
                            <Textarea
                                id="template-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What this template is used for..."
                                rows={2}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Permissions</Label>
                                <Button variant="ghost" size="sm" leftIcon="add" onClick={addPermission}>
                                    Add
                                </Button>
                            </div>
                            {permissions.length === 0 ? (
                                <p className="text-sm text-neutral-500 text-center py-4">
                                    No permissions added yet
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {permissions.map((perm, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <select
                                                className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                                                value={perm.entityType}
                                                onChange={(e) => updatePermission(idx, "entityType", e.target.value)}
                                            >
                                                <option value="">Select entity...</option>
                                                {models.map(m => (
                                                    <option key={m.id} value={m.entityType}>{m.entityType}</option>
                                                ))}
                                            </select>
                                            <select
                                                className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                                                value={perm.relation}
                                                onChange={(e) => updatePermission(idx, "relation", e.target.value)}
                                            >
                                                <option value="">Select relation...</option>
                                                {models.find(m => m.entityType === perm.entityType)?.relations.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                            <Button variant="ghost" size="sm" onClick={() => removePermission(idx)}>
                                                <Icon name="close" className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <ModalFooter>
                        <Button variant="secondary" onClick={() => { setShowCreate(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleCreate} disabled={creating}>
                            {creating ? "Creating..." : "Create Template"}
                        </Button>
                    </ModalFooter>
                </Modal>
        </CollapsibleSection>
    );
}

// ============================================================================
// Authorization Models Section
// ============================================================================

interface AuthorizationModelsSectionProps {
    models: AuthorizationModel[];
}

export function AuthorizationModelsSection({ models }: AuthorizationModelsSectionProps) {
    const [showCreate, setShowCreate] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [deleting, setDeleting] = React.useState<string | null>(null);

    // Form state
    const [entityType, setEntityType] = React.useState("");
    const [relationsInput, setRelationsInput] = React.useState("");

    function resetForm() {
        setEntityType("");
        setRelationsInput("");
    }

    async function handleCreate() {
        if (!entityType.trim()) {
            toast.error("Entity type is required");
            return;
        }

        const relations = relationsInput.split(",").map(r => r.trim()).filter(r => r);
        if (relations.length === 0) {
            toast.error("At least one relation is required");
            return;
        }

        setCreating(true);
        try {
            const result = await createAuthorizationModel({
                entityType: entityType.trim(),
                relations,
            });
            if (result.success) {
                toast.success("Model created");
                setShowCreate(false);
                resetForm();
            } else {
                toast.error(result.error || "Failed to create model");
            }
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(entityTypeToDelete: string) {
        setDeleting(entityTypeToDelete);
        try {
            const result = await deleteAuthorizationModel(entityTypeToDelete);
            if (result.success) {
                toast.success("Model deleted");
            } else {
                toast.error(result.error || "Failed to delete model");
            }
        } finally {
            setDeleting(null);
        }
    }

    // Group models: platform first, then features
    const platformModel = models.find(m => m.entityType === "platform");
    const featureModels = models.filter(m => m.entityType !== "platform");

    return (
        <CollapsibleSection
            title="Authorization Models"
            icon="account_tree"
            description="Define relations for platform features"
            defaultOpen
            actions={
                <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowCreate(true)}>
                    Add Model
                </Button>
            }
        >
                {/* Platform Model (highlighted) */}
                {platformModel && (
                    <CollapsibleSection
                        title={
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">Platform</span>
                                <Badge variant="info">Core</Badge>
                            </div>
                        }
                        description={platformModel.description || undefined}
                        actions={
                            <Badge variant="default">{platformModel.relations.length} relations</Badge>
                        }
                    >
                        <div className="flex flex-wrap gap-2">
                            {platformModel.relations.map((rel) => (
                                <Badge key={rel} variant="default" className="font-mono text-xs">
                                    {rel}
                                </Badge>
                            ))}
                        </div>
                    </CollapsibleSection>
                )}

                {/* Feature Models */}
                {featureModels.map((model) => (
                    <CollapsibleSection
                        key={model.id}
                        title={
                            <div className="flex items-center gap-2">
                                <span className="font-semibold capitalize">{model.entityType}</span>
                                {model.isSystem && (
                                    <Badge variant="default">System</Badge>
                                )}
                            </div>
                        }
                        description={model.description || undefined}
                        actions={
                            <div className="flex items-center gap-2">
                                <Badge variant="default">{model.relations.length} relations</Badge>
                                {!model.isSystem && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(model.entityType);
                                        }}
                                        disabled={deleting === model.entityType}
                                    >
                                        <Icon name="delete" size="xs" className="h-4 w-4 text-red-500" />
                                    </Button>
                                )}
                            </div>
                        }
                    >
                        <div className="flex flex-wrap gap-2">
                            {model.relations.map((rel) => (
                                <Badge key={rel} variant="default" className="font-mono text-xs">
                                    {rel}
                                </Badge>
                            ))}
                        </div>
                    </CollapsibleSection>
                ))}

                {models.length === 0 && (
                    <EmptyState
                        icon="account_tree"
                        title="No authorization models defined"
                        description="Create models to define feature permissions"
                    />
                )}

                {/* Create Model Modal */}
                <Modal
                    isOpen={showCreate}
                    onClose={() => { setShowCreate(false); resetForm(); }}
                    title="Create Authorization Model"
                >
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="entityType">Entity Type</Label>
                            <Input
                                id="entityType"
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value)}
                                placeholder="e.g., reports, analytics, billing"
                            />
                            <p className="text-xs text-neutral-500 mt-1">
                                Lowercase, no spaces. Used as permission namespace.
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="relations">Relations (comma-separated)</Label>
                            <Input
                                id="relations"
                                value={relationsInput}
                                onChange={(e) => setRelationsInput(e.target.value)}
                                placeholder="e.g., viewer, editor, admin"
                            />
                            <p className="text-xs text-neutral-500 mt-1">
                                Define permission levels for this entity type.
                            </p>
                        </div>
                    </div>
                    <ModalFooter>
                        <Button variant="secondary" onClick={() => { setShowCreate(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleCreate} disabled={creating}>
                            {creating ? "Creating..." : "Create Model"}
                        </Button>
                    </ModalFooter>
                </Modal>
        </CollapsibleSection>
    );
}

// ============================================================================
// Client Registration Whitelist Section
// ============================================================================

interface ClientWhitelistSectionProps {
    clients: ClientWithRegistrationStatus[];
}

export function ClientWhitelistSection({ clients }: ClientWhitelistSectionProps) {
    const [updating, setUpdating] = React.useState<string | null>(null);

    async function handleToggle(clientId: string, currentValue: boolean) {
        setUpdating(clientId);
        try {
            const result = await toggleClientRegistrationContexts(clientId, !currentValue);
            if (result.success) {
                toast.success(currentValue ? "Registration contexts disabled" : "Registration contexts enabled");
            } else {
                toast.error(result.error || "Failed to update");
            }
        } finally {
            setUpdating(null);
        }
    }

    const enabledClients = clients.filter(c => c.allowsRegistrationContexts);
    const disabledClients = clients.filter(c => !c.allowsRegistrationContexts);

    return (
        <CollapsibleSection
            title="Client Registration Whitelist"
            icon="app_registration"
            description="Only whitelisted clients can create registration contexts for user sign-up"
            defaultOpen
        >
                <div className="space-y-4">
                    {/* Enabled clients */}
                    {enabledClients.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2 flex items-center gap-1">
                                <Icon name="check_circle" size="xs" className="h-4 w-4" />
                                Enabled ({enabledClients.length})
                            </h4>
                            <div className="space-y-2">
                                {enabledClients.map((client) => (
                                    <div
                                        key={client.clientId}
                                        className="flex items-center justify-between rounded-lg border border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-900/20 p-3"
                                    >
                                        <div>
                                            <span className="font-medium">{client.name || client.clientId}</span>
                                            {client.contextCount > 0 && (
                                                <span className="ml-2 text-sm text-neutral-500">
                                                    ({client.contextCount} contexts)
                                                </span>
                                            )}
                                        </div>
                                        <Switch
                                            checked={client.allowsRegistrationContexts}
                                            onChange={() => handleToggle(client.clientId, client.allowsRegistrationContexts)}
                                            disabled={updating === client.clientId}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Disabled clients */}
                    {disabledClients.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-neutral-500 mb-2 flex items-center gap-1">
                                <Icon name="block" size="xs" className="h-4 w-4" />
                                Disabled ({disabledClients.length})
                            </h4>
                            <div className="space-y-2">
                                {disabledClients.map((client) => (
                                    <div
                                        key={client.clientId}
                                        className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3"
                                    >
                                        <span className="font-medium text-neutral-600 dark:text-neutral-400">
                                            {client.name || client.clientId}
                                        </span>
                                        <Switch
                                            checked={client.allowsRegistrationContexts}
                                            onChange={() => handleToggle(client.clientId, client.allowsRegistrationContexts)}
                                            disabled={updating === client.clientId}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {clients.length === 0 && (
                        <EmptyState
                            icon="apps"
                            title="No OAuth clients registered"
                        />
                    )}
                </div>
        </CollapsibleSection>
    );
}

// ============================================================================
// Platform Registration Contexts Section
// ============================================================================

interface PlatformContextsSectionProps {
    contexts: RegistrationContext[];
    models: AuthorizationModel[];
}

export function PlatformContextsSection({ contexts, models }: PlatformContextsSectionProps) {
    const [updating, setUpdating] = React.useState<string | null>(null);
    const [showCreate, setShowCreate] = React.useState(false);
    const [creating, setCreating] = React.useState(false);

    // Form state
    const [slug, setSlug] = React.useState("");
    const [name, setName] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [originsText, setOriginsText] = React.useState("");
    const [grants, setGrants] = React.useState<Array<{ entityType: string; relation: string }>>([]);

    async function handleToggleEnabled(id: string, currentValue: boolean) {
        setUpdating(id);
        try {
            const result = await toggleContextEnabled(id, !currentValue);
            if (result.success) {
                toast.success(currentValue ? "Context disabled" : "Context enabled");
            } else {
                toast.error(result.error || "Failed to update");
            }
        } finally {
            setUpdating(null);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to delete this context?")) return;

        const result = await deleteContext(id);
        if (result.success) {
            toast.success("Context deleted");
        } else {
            toast.error(result.error || "Failed to delete");
        }
    }

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
            const result = await createPlatformContext({
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

    function resetForm() {
        setSlug("");
        setName("");
        setDescription("");
        setOriginsText("");
        setGrants([]);
    }

    function addGrant() {
        setGrants([...grants, { entityType: "", relation: "" }]);
    }

    function removeGrant(idx: number) {
        setGrants(grants.filter((_, i) => i !== idx));
    }

    function updateGrant(idx: number, field: "entityType" | "relation", value: string) {
        const updated = [...grants];
        updated[idx] = { ...updated[idx], [field]: value };
        setGrants(updated);
    }

    return (
        <CollapsibleSection
            title="Platform Registration Contexts"
            icon="person_add"
            description="Sign-up flows that grant platform-level permissions"
            defaultOpen
            actions={
                <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowCreate(true)}>
                    Create Context
                </Button>
            }
        >
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
                                            onChange={() => handleToggleEnabled(context.id, context.enabled ?? false)}
                                            disabled={updating === context.id}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(context.id)}
                                        >
                                            <Icon name="delete" size="xs" className="h-4 w-4 text-red-500" />
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
                                                    {grant.entityType ? `${grant.entityType}:` : ""}{grant.relation}
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
                        title="No platform registration contexts"
                        description="Create contexts to enable user sign-up with platform permissions"
                    />
                )}

                {/* Create Context Modal */}
                <Modal
                    isOpen={showCreate}
                    onClose={() => { setShowCreate(false); resetForm(); }}
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
                                    placeholder="e.g., Platform Admin"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="context-slug">Slug</Label>
                                <Input
                                    id="context-slug"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    placeholder="e.g., platform-admin"
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
                                <Button variant="ghost" size="sm" leftIcon="add" onClick={addGrant}>
                                    Add
                                </Button>
                            </div>
                            {grants.length === 0 ? (
                                <p className="text-sm text-neutral-500 text-center py-4">
                                    No grants added yet
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {grants.map((grant, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <select
                                                className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                                                value={grant.entityType}
                                                onChange={(e) => updateGrant(idx, "entityType", e.target.value)}
                                            >
                                                <option value="">Select entity...</option>
                                                {models.map(m => (
                                                    <option key={m.id} value={m.entityType}>{m.entityType}</option>
                                                ))}
                                            </select>
                                            <select
                                                className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                                                value={grant.relation}
                                                onChange={(e) => updateGrant(idx, "relation", e.target.value)}
                                            >
                                                <option value="">Select relation...</option>
                                                {models.find(m => m.entityType === grant.entityType)?.relations.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                            <Button variant="ghost" size="sm" onClick={() => removeGrant(idx)}>
                                                <Icon name="close" className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
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
                </Modal>
        </CollapsibleSection>
    );
}
