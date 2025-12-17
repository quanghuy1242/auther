"use client";

import * as React from "react";
import {
    Button,
    Badge,
    Modal,
    ModalFooter,
    Icon,
    Input,
    Label,
    Select,
    Switch,
    Tabs,
    EmptyState,
} from "@/components/ui";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { toast } from "sonner";
import type {
    PermissionRequestWithDetails,
    PermissionRule,
} from "./actions";
import {
    approveRequest,
    rejectRequest,
    createAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
} from "./actions";

// ============================================================================
// Pending Requests Section
// ============================================================================

interface PendingRequestsSectionProps {
    requests: PermissionRequestWithDetails[];
}

export function PendingRequestsSection({ requests }: PendingRequestsSectionProps) {
    const [processing, setProcessing] = React.useState<string | null>(null);

    async function handleApprove(id: string) {
        setProcessing(id);
        try {
            const result = await approveRequest(id);
            if (result.success) {
                toast.success("Request approved");
            } else {
                toast.error(result.error || "Failed to approve");
            }
        } finally {
            setProcessing(null);
        }
    }

    async function handleReject(id: string) {
        setProcessing(id);
        try {
            const result = await rejectRequest(id);
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
        <CollapsibleSection
            title={
                <span className="flex items-center gap-2">
                    Pending Requests
                    {pendingRequests.length > 0 && (
                        <Badge variant="warning">{pendingRequests.length}</Badge>
                    )}
                </span>
            }
            icon="pending_actions"
            description="Permission escalation requests awaiting approval"
            defaultOpen
        >
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
                                                {request.userName || request.userId}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-neutral-500">Requesting:</span>
                                            <Badge variant="default" className="font-mono">
                                                {request.clientId ? `client:${request.clientId}` : "platform"}:{request.relation}
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
        </CollapsibleSection>
    );
}

// ============================================================================
// Request History Section
// ============================================================================

interface RequestHistorySectionProps {
    requests: PermissionRequestWithDetails[];
}

export function RequestHistorySection({ requests }: RequestHistorySectionProps) {
    const processedRequests = requests.filter(r => r.status !== "pending");

    return (
        <CollapsibleSection
            title="Request History"
            icon="history"
            description="Previously processed permission requests"
            defaultOpen
        >
                {processedRequests.length > 0 ? (
                    <div className="space-y-2">
                        {processedRequests.map((request) => (
                            <div
                                key={request.id}
                                className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3"
                            >
                                <div className="flex items-center gap-3">
                                    <Icon
                                        name={request.status === "approved" ? "check_circle" : "cancel"}
                                        className={`h-5 w-5 ${request.status === "approved" ? "text-green-500" : "text-red-500"}`}
                                    />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">
                                                {request.userName || request.userId}
                                            </span>
                                            <Badge variant="default" className="font-mono text-xs">
                                                {request.relation}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-neutral-500">
                                            {request.status === "approved" ? "Approved" : "Rejected"} on {request.resolvedAt?.toLocaleDateString() || "N/A"}
                                        </p>
                                    </div>
                                </div>
                                <Badge variant={request.status === "approved" ? "success" : "danger"}>
                                    {request.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon="history"
                        title="No request history"
                    />
                )}
        </CollapsibleSection>
    );
}

// ============================================================================
// Automation Rules Section
// ============================================================================

interface AutomationRulesSectionProps {
    rules: PermissionRule[];
}

export function AutomationRulesSection({ rules }: AutomationRulesSectionProps) {
    const [showCreate, setShowCreate] = React.useState(false);
    const [showEdit, setShowEdit] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [updating, setUpdating] = React.useState(false);
    const [editingRule, setEditingRule] = React.useState<PermissionRule | null>(null);

    // Create form state
    const [relation, setRelation] = React.useState("");
    const [selfRequestable, setSelfRequestable] = React.useState(false);
    const [defaultAction, setDefaultAction] = React.useState<"require_approval" | "auto_approve" | "auto_reject">("require_approval");

    // Edit form state
    const [editSelfRequestable, setEditSelfRequestable] = React.useState(false);
    const [editDefaultAction, setEditDefaultAction] = React.useState<"require_approval" | "auto_approve" | "auto_reject">("require_approval");

    async function handleCreate() {
        if (!relation.trim()) {
            toast.error("Relation is required");
            return;
        }

        setCreating(true);
        try {
            const result = await createAutomationRule({
                relation: relation.trim(),
                selfRequestable,
                defaultAction,
            });
            if (result.success) {
                toast.success("Rule created");
                setShowCreate(false);
                resetCreateForm();
            } else {
                toast.error(result.error || "Failed to create rule");
            }
        } finally {
            setCreating(false);
        }
    }

    async function handleUpdate() {
        if (!editingRule) return;

        setUpdating(true);
        try {
            const result = await updateAutomationRule(editingRule.id, {
                selfRequestable: editSelfRequestable,
                defaultAction: editDefaultAction,
            });
            if (result.success) {
                toast.success("Rule updated");
                setShowEdit(false);
                setEditingRule(null);
            } else {
                toast.error(result.error || "Failed to update rule");
            }
        } finally {
            setUpdating(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to delete this rule?")) return;

        const result = await deleteAutomationRule(id);
        if (result.success) {
            toast.success("Rule deleted");
        } else {
            toast.error(result.error || "Failed to delete rule");
        }
    }

    function openEdit(rule: PermissionRule) {
        setEditingRule(rule);
        setEditSelfRequestable(rule.selfRequestable ?? false);
        setEditDefaultAction((rule.defaultAction ?? "require_approval") as "require_approval" | "auto_approve" | "auto_reject");
        setShowEdit(true);
    }

    function resetCreateForm() {
        setRelation("");
        setSelfRequestable(false);
        setDefaultAction("require_approval");
    }

    return (
        <CollapsibleSection
            title="Automation Rules"
            icon="auto_fix_high"
            description="Configure automatic handling of permission requests"
            defaultOpen
            actions={
                <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowCreate(true)}>
                    Add Rule
                </Button>
            }
        >
                {rules.length > 0 ? (
                    <div className="space-y-2">
                        {rules.map((rule) => (
                            <div
                                key={rule.id}
                                className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3"
                            >
                                <div className="flex items-center gap-3">
                                    <Badge variant="default" className="font-mono">
                                        {rule.relation}
                                    </Badge>
                                    <div className="flex items-center gap-2 text-sm">
                                        {rule.selfRequestable && (
                                            <Badge variant="info">Self-request</Badge>
                                        )}
                                        <Badge
                                            variant={
                                                rule.defaultAction === "auto_approve"
                                                    ? "success"
                                                    : rule.defaultAction === "auto_reject"
                                                        ? "danger"
                                                        : "default"
                                            }
                                        >
                                            {rule.defaultAction.replace("_", " ")}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEdit(rule)}
                                    >
                                        <Icon name="edit" className="h-4 w-4 text-neutral-500" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(rule.id)}
                                    >
                                        <Icon name="delete" className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon="auto_fix_high"
                        title="No automation rules"
                        description="All requests require manual approval"
                    />
                )}

                {/* Create Rule Modal */}
                <Modal
                    isOpen={showCreate}
                    onClose={() => { setShowCreate(false); resetCreateForm(); }}
                    title="Create Automation Rule"
                >
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="rule-relation">Relation</Label>
                            <Input
                                id="rule-relation"
                                value={relation}
                                onChange={(e) => setRelation(e.target.value)}
                                placeholder="e.g., viewer, editor, admin"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Self-Requestable</Label>
                                <p className="text-sm text-neutral-500">Users can request this permission themselves</p>
                            </div>
                            <Switch
                                checked={selfRequestable}
                                onChange={(checked) => setSelfRequestable(checked)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Default Action</Label>
                            <Select
                                value={defaultAction}
                                onChange={(value) => setDefaultAction(value as typeof defaultAction)}
                                options={[
                                    { value: "require_approval", label: "Require Approval" },
                                    { value: "auto_approve", label: "Auto Approve" },
                                    { value: "auto_reject", label: "Auto Reject" },
                                ]}
                            />
                        </div>
                    </div>
                    <ModalFooter>
                        <Button variant="secondary" onClick={() => { setShowCreate(false); resetCreateForm(); }}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleCreate} disabled={creating}>
                            {creating ? "Creating..." : "Create Rule"}
                        </Button>
                    </ModalFooter>
                </Modal>

                {/* Edit Rule Modal */}
                <Modal
                    isOpen={showEdit}
                    onClose={() => { setShowEdit(false); setEditingRule(null); }}
                    title="Edit Automation Rule"
                >
                    {editingRule && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Relation</Label>
                                <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-md">
                                    <Badge variant="default" className="font-mono">
                                        {editingRule.relation}
                                    </Badge>
                                </div>
                                <p className="text-xs text-neutral-500">Relation cannot be changed after creation</p>
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label>Self-Requestable</Label>
                                    <p className="text-sm text-neutral-500">Users can request this permission themselves</p>
                                </div>
                                <Switch
                                    checked={editSelfRequestable}
                                    onChange={(checked) => setEditSelfRequestable(checked)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Default Action</Label>
                                <Select
                                    value={editDefaultAction}
                                    onChange={(value) => setEditDefaultAction(value as typeof editDefaultAction)}
                                    options={[
                                        { value: "require_approval", label: "Require Approval" },
                                        { value: "auto_approve", label: "Auto Approve" },
                                        { value: "auto_reject", label: "Auto Reject" },
                                    ]}
                                />
                            </div>
                        </div>
                    )}
                    <ModalFooter>
                        <Button variant="secondary" onClick={() => { setShowEdit(false); setEditingRule(null); }}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleUpdate} disabled={updating}>
                            {updating ? "Saving..." : "Save Changes"}
                        </Button>
                    </ModalFooter>
                </Modal>
        </CollapsibleSection>
    );
}

// ============================================================================
// Main Requests Client
// ============================================================================

interface RequestsClientProps {
    pendingRequests: PermissionRequestWithDetails[];
    allRequests: PermissionRequestWithDetails[];
    rules: PermissionRule[];
}

export function RequestsClient({ pendingRequests, allRequests, rules }: RequestsClientProps) {
    return (
        <Tabs
            tabs={[
                {
                    label: `Pending${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}`,
                    content: (
                        <div className="space-y-6">
                            <PendingRequestsSection requests={pendingRequests} />
                        </div>
                    ),
                },
                {
                    label: "History",
                    content: (
                        <div className="space-y-6">
                            <RequestHistorySection requests={allRequests} />
                        </div>
                    ),
                },
                {
                    label: "Automation",
                    content: (
                        <div className="space-y-6">
                            <AutomationRulesSection rules={rules} />
                        </div>
                    ),
                },
            ]}
        />
    );
}
