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
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Select,
} from "@/components/ui";

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
    applyTemplateToUsers,
    toggleClientRegistrationContexts,
    toggleContextEnabled,
    deleteContext,
    createPlatformContext,
    createAuthorizationModel,
    updateAuthorizationModel,
    deleteAuthorizationModel,
} from "./actions";
import { getAllUsers } from "@/app/admin/users/actions";
import type { UserPickerItem } from "@/app/admin/users/actions";

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

    // User assignment state
    const [showAssign, setShowAssign] = React.useState(false);
    const [userSearch, setUserSearch] = React.useState("");
    const [availableUsers, setAvailableUsers] = React.useState<UserPickerItem[]>([]);
    const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
    const [assigning, setAssigning] = React.useState(false);
    const [loadingUsers, setLoadingUsers] = React.useState(false);

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

    // User assignment functions
    async function openAssignModal() {
        if (!selectedTemplate) return;
        setShowAssign(true);
        setLoadingUsers(true);
        try {
            const users = await getAllUsers();
            setAvailableUsers(users);
        } catch (_e) {
            toast.error("Failed to load users");
        } finally {
            setLoadingUsers(false);
        }
    }

    async function handleUserSearch(query: string) {
        setUserSearch(query);
        if (query.trim()) {
            setLoadingUsers(true);
            try {
                const users = await getAllUsers(query);
                setAvailableUsers(users);
            } finally {
                setLoadingUsers(false);
            }
        }
    }

    async function handleAssign() {
        if (!selectedTemplate || selectedUserIds.length === 0) return;
        setAssigning(true);
        try {
            const result = await applyTemplateToUsers({
                templateId: selectedTemplate.id,
                userIds: selectedUserIds,
            });
            if (result.success) {
                toast.success(`Applied template to ${selectedUserIds.length} user(s). ${result.appliedCount} new permissions granted.`);
                resetAssign();
            } else {
                toast.error(result.error || "Failed to apply template");
            }
        } finally {
            setAssigning(false);
        }
    }

    function toggleUser(userId: string) {
        setSelectedUserIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        );
    }

    function resetAssign() {
        setShowAssign(false);
        setUserSearch("");
        setAvailableUsers([]);
        setSelectedUserIds([]);
    }

    const systemTemplates = templates.filter(t => t.isSystem);
    const customTemplates = templates.filter(t => !t.isSystem);

    return (
        <Card>
            <CardHeader className="border-b border-[#243647] pb-6 flex-row items-start justify-between space-y-0">
                <div className="flex flex-1 items-center gap-4">
                    <div className="flex-1">
                        <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                            <Icon name="shield" size="xs" className="h-5 w-5 text-gray-400" />
                            Policy Templates
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-400 mt-1">Pre-configured permission bundles that can be applied to users</CardDescription>
                    </div>
                </div>
                <div className="pl-4 flex items-center">
                    <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowCreate(true)}>
                        Create Template
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="!pt-6 flex flex-col gap-6">
                {/* System Templates */}
                {systemTemplates.length > 0 && (
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-2">System Templates</h4>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {systemTemplates.map((template) => (
                                <div
                                    key={template.id}
                                    className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 dark:border-[#243647] cursor-pointer hover:border-neutral-300 dark:hover:border-neutral-600"
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
                                    className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 dark:border-[#243647] cursor-pointer hover:border-neutral-300 dark:hover:border-neutral-600 group"
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
                    <ModalFooter>
                        <Button variant="secondary" onClick={() => setSelectedTemplate(null)}>
                            Close
                        </Button>
                        <Button variant="primary" leftIcon="group_add" onClick={openAssignModal}>
                            Assign to Users
                        </Button>
                    </ModalFooter>
                </Modal>

                {/* User Assignment Modal */}
                <Modal
                    isOpen={showAssign}
                    onClose={resetAssign}
                    title={`Assign "${selectedTemplate?.name}" to Users`}
                >
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="user-search">Search Users</Label>
                            <Input
                                id="user-search"
                                value={userSearch}
                                onChange={(e) => handleUserSearch(e.target.value)}
                                placeholder="Search by name or email..."
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <Label>Select Users</Label>
                                {selectedUserIds.length > 0 && (
                                    <Badge variant="info">{selectedUserIds.length} selected</Badge>
                                )}
                            </div>
                            <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg max-h-64 overflow-y-auto">
                                {loadingUsers ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Icon name="hourglass_top" className="h-5 w-5 text-neutral-400 animate-spin" />
                                    </div>
                                ) : availableUsers.length === 0 ? (
                                    <div className="text-center py-8 text-sm text-neutral-500">
                                        {userSearch ? "No users found" : "No users available"}
                                    </div>
                                ) : (
                                    availableUsers.map((user) => (
                                        <div
                                            key={user.id}
                                            className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0 ${selectedUserIds.includes(user.id) ? "bg-blue-50 dark:bg-blue-900/20" : ""
                                                }`}
                                            onClick={() => toggleUser(user.id)}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedUserIds.includes(user.id)}
                                                onChange={() => toggleUser(user.id)}
                                                className="h-4 w-4 rounded border-neutral-300"
                                            />
                                            {user.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={user.image} alt="" className="h-8 w-8 rounded-full" />
                                            ) : (
                                                <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                                                    <Icon name="person" className="h-4 w-4 text-neutral-500" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{user.name || "No Name"}</p>
                                                <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                    <ModalFooter>
                        <Button variant="secondary" onClick={resetAssign}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleAssign}
                            disabled={assigning || selectedUserIds.length === 0}
                        >
                            {assigning ? "Applying..." : `Apply to ${selectedUserIds.length || 0} User(s)`}
                        </Button>
                    </ModalFooter>
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
                                <div className="space-y-3">
                                    {permissions.map((perm, idx) => {
                                        const entityOptions = models.map(m => ({ value: m.entityType, label: m.entityType }));
                                        const relationOptions = models.find(m => m.entityType === perm.entityType)?.relations.map(r => ({ value: r, label: r })) || [];

                                        return (
                                            <div key={idx} className="flex items-center gap-2">
                                                <Select
                                                    options={entityOptions}
                                                    value={perm.entityType}
                                                    onChange={(val) => updatePermission(idx, "entityType", val)}
                                                    placeholder="Select entity..."
                                                    className="flex-1 min-w-0"
                                                />
                                                <Select
                                                    options={relationOptions}
                                                    value={perm.relation}
                                                    onChange={(val) => updatePermission(idx, "relation", val)}
                                                    placeholder="Select relation..."
                                                    disabled={!perm.entityType}
                                                    className="flex-1 min-w-0"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => removePermission(idx)}
                                                >
                                                    <Icon name="close" size="xs" />
                                                </Button>
                                            </div>
                                        );
                                    })}
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
            </CardContent>
        </Card>
    );
}

// ============================================================================
// Authorization Models Section
// ============================================================================

interface AuthorizationModelsSectionProps {
    models: AuthorizationModel[];
}

export function AuthorizationModelsSection({ models }: AuthorizationModelsSectionProps) {
    const [showModal, setShowModal] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [deleting, setDeleting] = React.useState<string | null>(null);
    const [editingModel, setEditingModel] = React.useState<AuthorizationModel | null>(null);

    // Form state
    const [entityType, setEntityType] = React.useState("");
    const [relationsInput, setRelationsInput] = React.useState("");

    function resetForm() {
        setEntityType("");
        setRelationsInput("");
        setEditingModel(null);
    }

    function openEdit(model: AuthorizationModel) {
        setEditingModel(model);
        setEntityType(model.entityType);
        setRelationsInput(model.definition?.relations ? Object.keys(model.definition.relations).join(", ") : "");
        setShowModal(true);
    }

    async function handleSave() {
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
            // If editing, use update; otherwise use create
            const permissionsArg = editingModel?.definition?.permissions;
            const actionPayload = {
                entityType: entityType.trim(),
                relations,
                description: editingModel?.description || undefined,
                permissions: permissionsArg
            };

            const result = editingModel
                ? await updateAuthorizationModel(actionPayload)
                : await createAuthorizationModel(actionPayload);

            if (result.success) {
                toast.success(editingModel ? "Model updated" : "Model created");
                setShowModal(false);
                resetForm();
            } else {
                toast.error(result.error || "Failed to save model");
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

    // Helper to render the role-permission visual
    const renderVisualization = (model: AuthorizationModel) => {
        const definition = model.definition;
        if (!definition) return null;

        return (
            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-[#243647]">
                <div className="space-y-3">
                    {definition.relations && Object.keys(definition.relations).map((role) => {
                        const grants = definition.permissions
                            ? Object.entries(definition.permissions)
                                .filter(([_, def]) => def.relation === role)
                                .map(([perm]) => perm)
                            : [];
                        const relationDef = definition.relations[role];
                        const inheritance = Array.isArray(relationDef)
                            ? relationDef
                            : (relationDef && typeof relationDef === 'object' && 'union' in relationDef)
                                ? (relationDef.union ?? [])
                                : [];

                        return (
                            <div key={role} className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                                <div className="min-w-[100px] flex-shrink-0">
                                    <Badge variant="default" className="font-mono text-xs bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                                        {role}
                                    </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 flex-1">
                                    {grants.length > 0 ? (
                                        grants.map(perm => (
                                            <Badge key={perm} variant="default" className="text-[10px] px-1 py-0 h-5 bg-transparent text-neutral-500 border border-neutral-200 dark:border-neutral-700">
                                                {perm}
                                            </Badge>
                                        ))
                                    ) : (
                                        inheritance.length > 0 ? (
                                            <span className="text-xs text-neutral-400 italic">Inherits: {inheritance.join(", ")}</span>
                                        ) : (
                                            <span className="text-xs text-neutral-400 italic">No direct permissions</span>
                                        )
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <Card>
            <CardHeader className="border-b border-[#243647] pb-6 flex-row items-start justify-between space-y-0">
                <div className="flex flex-1 items-center gap-4">
                    <div className="flex-1">
                        <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                            <Icon name="account_tree" size="xs" className="h-5 w-5 text-gray-400" />
                            Authorization Models
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-400 mt-1">Define relations for platform features</CardDescription>
                    </div>
                </div>
                <div className="pl-4 flex items-center">
                    <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowModal(true)}>
                        Add Model
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="!pt-6 flex flex-col gap-6">
                <div className="space-y-6">
                    {/* System Models Channel */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-3 flex items-center gap-2">
                            <Icon name="dns" size="xs" className="h-4 w-4" />
                            System Features
                        </h4>
                        <div className="grid gap-4">
                            {models.filter(m => m.isSystem).map((model) => (
                                <div
                                    key={model.entityType}
                                    className="rounded-lg border border-neutral-200 dark:border-[#243647] p-4 bg-neutral-50/50 dark:bg-neutral-900/20"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold capitalize font-mono text-sm">{model.entityType}</span>
                                                <Badge variant="info">System</Badge>
                                                {model.isOverridden && <Badge variant="warning">Overridden</Badge>}
                                            </div>
                                            {model.description && (
                                                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                                    {model.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center space-x-1">
                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(model)}>
                                                <Icon name="edit" size="xs" className="text-neutral-500" />
                                            </Button>
                                            {model.isOverridden && (
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-orange-100 dark:hover:bg-orange-900/30" onClick={() => handleDelete(model.entityType)} disabled={deleting === model.entityType} title="Reset to Default">
                                                    <Icon name="history" size="xs" className="text-orange-500" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    {renderVisualization(model)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Custom Models Channel */}
                    <div>
                        <h4 className="text-sm font-medium text-neutral-500 mb-3 flex items-center gap-2">
                            <Icon name="extension" size="xs" className="h-4 w-4" />
                            Custom Models
                        </h4>
                        <div className="grid gap-4">
                            {models.filter(m => !m.isSystem).length > 0 ? (
                                models.filter(m => !m.isSystem).map((model) => (
                                    <div
                                        key={model.id}
                                        className="rounded-lg border border-neutral-200 dark:border-[#243647] p-4"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold capitalize">{model.entityType}</span>
                                                </div>
                                                {model.description && (
                                                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                                        {model.description}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center space-x-1">
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(model)}>
                                                    <Icon name="edit" size="xs" className="text-neutral-500" />
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/30" onClick={() => handleDelete(model.entityType)} disabled={deleting === model.entityType}>
                                                    <Icon name="delete" size="xs" className="text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                        {renderVisualization(model)}
                                    </div>
                                ))
                            ) : (
                                <EmptyState
                                    icon="account_tree"
                                    title="No custom models defined"
                                    description="Create models to define permissions for your own modules"
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Create/Edit Model Modal */}
                <Modal
                    isOpen={showModal}
                    onClose={() => { setShowModal(false); resetForm(); }}
                    title={editingModel ? "Edit Authorization Model" : "Create Authorization Model"}
                >
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="entityType">Entity Type</Label>
                            <Input
                                id="entityType"
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value)}
                                placeholder="e.g., reports, analytics, billing"
                                disabled={!!editingModel} // Cannot change ID
                            />
                            <p className="text-xs text-neutral-500 mt-1">
                                {editingModel ? "Entity type cannot be changed." : "Lowercase, no spaces. Used as permission namespace."}
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
                        {editingModel && editingModel.isSystem && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-100 dark:border-blue-800">
                                <p className="text-xs text-blue-700 dark:text-blue-300">
                                    <strong>Note:</strong> Editing this system model will create a database override. You can revert to defaults anytime.
                                </p>
                            </div>
                        )}
                    </div>
                    <ModalFooter>
                        <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleSave} disabled={creating}>
                            {creating ? "Saving..." : (editingModel ? "Save Changes" : "Create Model")}
                        </Button>
                    </ModalFooter>
                </Modal>
            </CardContent>
        </Card>
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
        <Card>
            <CardHeader className="border-b border-[#243647] pb-6">
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                            <Icon name="app_registration" size="xs" className="h-5 w-5 text-gray-400" />
                            Client Registration Whitelist
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-400 mt-1">Only whitelisted clients can create registration contexts for user sign-up</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="!pt-6 flex flex-col gap-6">
                <div className="space-y-4">
                    {/* Enabled clients */}
                    {enabledClients.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2 flex items-center gap-2">
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
                            <h4 className="text-sm font-medium text-neutral-500 mb-2 flex items-center gap-2">
                                <Icon name="block" size="xs" className="h-4 w-4" />
                                Disabled ({disabledClients.length})
                            </h4>
                            <div className="space-y-2">
                                {disabledClients.map((client) => (
                                    <div
                                        key={client.clientId}
                                        className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-[#243647] p-3"
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
            </CardContent>
        </Card>
    );
}

// ============================================================================
// Platform Sign-Up Flows Section
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
    const [grants, setGrants] = React.useState<Array<{ entityTypeId: string; relation: string }>>([]);

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

    // Build options for entity type select (using model ID as value)
    const entityOptions = models.map(m => ({ value: m.id, label: m.entityType }));

    // Helper to get relations for a model by ID
    const getRelationsForModel = (modelId: string) => {
        const model = models.find(m => m.id === modelId);
        return model?.relations.map(r => ({ value: r, label: r })) || [];
    };

    // Helper to get display name for an entityTypeId
    const getEntityTypeName = (entityTypeId: string) => {
        return models.find(m => m.id === entityTypeId)?.entityType || entityTypeId;
    };

    return (
        <Card>
            <CardHeader className="border-b border-[#243647] pb-6 flex-row items-start justify-between space-y-0">
                <div className="flex flex-1 items-center gap-4">
                    <div className="flex-1">
                        <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                            <Icon name="person_add" size="xs" className="h-5 w-5 text-gray-400" />
                            Platform Sign-Up Flows
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-400 mt-1">Sign-up flows that grant platform-level permissions</CardDescription>
                    </div>
                </div>
                <div className="pl-4 flex items-center">
                    <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowCreate(true)}>
                        Create Context
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="!pt-6 flex flex-col gap-6">
                {contexts.length > 0 ? (
                    <div className="space-y-3">
                        {contexts.map((context) => (
                            <div
                                key={context.id}
                                className="rounded-lg border border-neutral-200 dark:border-[#243647] p-4"
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
                                <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-[#243647] space-y-2">
                                    {/* Grants */}
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-neutral-500">Grants:</span>
                                        <div className="flex flex-wrap gap-1">
                                            {context.grants.map((grant, idx) => (
                                                <Badge key={idx} variant="default" className="text-xs font-mono">
                                                    {getEntityTypeName(grant.entityTypeId)}:{grant.relation}
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
                                <div className="space-y-3">
                                    {grants.map((grant, idx) => {
                                        const relationOptions = getRelationsForModel(grant.entityTypeId);

                                        return (
                                            <div key={idx} className="flex items-center gap-2">
                                                <Select
                                                    options={entityOptions}
                                                    value={grant.entityTypeId}
                                                    onChange={(val) => updateGrant(idx, val, "")}
                                                    placeholder="Select entity..."
                                                    className="flex-1 min-w-0"
                                                />
                                                <Select
                                                    options={relationOptions}
                                                    value={grant.relation}
                                                    onChange={(val) => updateGrant(idx, grant.entityTypeId, val)}
                                                    placeholder="Select relation..."
                                                    disabled={!grant.entityTypeId}
                                                    className="flex-1 min-w-0"
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
            </CardContent>
        </Card>
    );
}
