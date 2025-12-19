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
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    EmptyState,
} from "@/components/ui";

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
        <Card>
            <CardHeader className="border-b border-[#243647] pb-6">
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                            <Icon name="pending_actions" size="xs" className="h-5 w-5 text-gray-400" />
                            <span className="flex items-center gap-2">
                                Pending Requests
                                {pendingRequests.length > 0 && (
                                    <Badge variant="warning">{pendingRequests.length}</Badge>
                                )}
                            </span>
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-400 mt-1">Permission escalation requests awaiting approval</CardDescription>
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
            </CardContent>
        </Card>
    );
}

// ============================================================================
// Request History Section
// ============================================================================

interface RequestHistorySectionProps {
    requests: PermissionRequestWithDetails[];
}

export function RequestHistorySection({ requests }: RequestHistorySectionProps) {
    // Filter state
    const [statusFilter, setStatusFilter] = React.useState<"all" | "approved" | "rejected">("all");
    const [userSearch, setUserSearch] = React.useState("");
    const [relationFilter, setRelationFilter] = React.useState<string>("all");
    const [dateFilter, setDateFilter] = React.useState<"all" | "today" | "week" | "month">("all");

    // Get all non-pending requests
    const allProcessedRequests = requests.filter(r => r.status !== "pending");

    // Get unique relations for filter dropdown
    const uniqueRelations = React.useMemo(() => {
        const relations = new Set(allProcessedRequests.map(r => r.relation));
        return Array.from(relations).sort();
    }, [allProcessedRequests]);

    // Apply filters
    const filteredRequests = React.useMemo(() => {
        let filtered = allProcessedRequests;

        // Status filter
        if (statusFilter !== "all") {
            filtered = filtered.filter(r => r.status === statusFilter);
        }

        // User search (case-insensitive)
        if (userSearch.trim()) {
            const searchLower = userSearch.toLowerCase();
            filtered = filtered.filter(r =>
                (r.userName?.toLowerCase().includes(searchLower)) ||
                (r.userId.toLowerCase().includes(searchLower))
            );
        }

        // Relation filter
        if (relationFilter !== "all") {
            filtered = filtered.filter(r => r.relation === relationFilter);
        }

        // Date filter
        if (dateFilter !== "all") {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            let cutoffDate: Date;

            switch (dateFilter) {
                case "today":
                    cutoffDate = startOfToday;
                    break;
                case "week":
                    cutoffDate = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case "month":
                    cutoffDate = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    cutoffDate = new Date(0);
            }

            filtered = filtered.filter(r => {
                const resolvedDate = r.resolvedAt || r.requestedAt;
                return resolvedDate >= cutoffDate;
            });
        }

        return filtered;
    }, [allProcessedRequests, statusFilter, userSearch, relationFilter, dateFilter]);

    const hasActiveFilters = statusFilter !== "all" || userSearch.trim() || relationFilter !== "all" || dateFilter !== "all";

    function clearFilters() {
        setStatusFilter("all");
        setUserSearch("");
        setRelationFilter("all");
        setDateFilter("all");
    }

    return (
        <Card>
            <CardHeader className="border-b border-[#243647] pb-6">
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                            <Icon name="history" size="xs" className="h-5 w-5 text-gray-400" />
                            Request History
                            {allProcessedRequests.length > 0 && (
                                <Badge variant="default">{allProcessedRequests.length}</Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-400 mt-1">Previously processed permission requests</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col gap-6">
                {/* Filters */}
                {allProcessedRequests.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <Select
                                value={statusFilter}
                                onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                                options={[
                                    { value: "all", label: "All statuses" },
                                    { value: "approved", label: "Approved" },
                                    { value: "rejected", label: "Rejected" },
                                ]}
                                className="w-36"
                            />
                            <Select
                                value={dateFilter}
                                onChange={(v) => setDateFilter(v as typeof dateFilter)}
                                options={[
                                    { value: "all", label: "All time" },
                                    { value: "today", label: "Today" },
                                    { value: "week", label: "Last 7 days" },
                                    { value: "month", label: "Last 30 days" },
                                ]}
                                className="w-36"
                            />
                            {uniqueRelations.length > 1 && (
                                <Select
                                    value={relationFilter}
                                    onChange={(v) => setRelationFilter(v)}
                                    options={[
                                        { value: "all", label: "All relations" },
                                        ...uniqueRelations.map(r => ({ value: r, label: r })),
                                    ]}
                                    className="w-36"
                                />
                            )}
                            <Input
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                placeholder="Search user..."
                                className="w-40"
                            />
                            {hasActiveFilters && (
                                <Button variant="ghost" size="sm" onClick={clearFilters}>
                                    <Icon name="close" size="xs" className="mr-1" />
                                    Clear
                                </Button>
                            )}
                        </div>
                        {hasActiveFilters && (
                            <p className="text-xs text-neutral-500">
                                Showing {filteredRequests.length} of {allProcessedRequests.length} requests
                            </p>
                        )}
                    </div>
                )}

                {/* Results */}
                {filteredRequests.length > 0 ? (
                    <div className="space-y-2">
                        {filteredRequests.map((request) => (
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
                ) : allProcessedRequests.length > 0 ? (
                    <EmptyState
                        icon="filter_alt"
                        title="No matching requests"
                        description="Try adjusting your filters"
                        action={
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                                Clear Filters
                            </Button>
                        }
                    />
                ) : (
                    <EmptyState
                        icon="history"
                        title="No request history"
                    />
                )}
            </CardContent>
        </Card>
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
        <Card>
            <CardHeader className="border-b border-[#243647] pb-6 flex-row items-start justify-between space-y-0">
                <div className="flex flex-1 items-center gap-4">
                    <div className="flex-1">
                        <CardTitle className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
                            <Icon name="auto_fix_high" size="xs" className="h-5 w-5 text-gray-400" />
                            Automation Rules
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-400 mt-1">Configure automatic handling of permission requests</CardDescription>
                    </div>
                </div>
                <div className="pl-4 flex items-center">
                    <Button variant="secondary" size="sm" leftIcon="add" onClick={() => setShowCreate(true)}>
                        Add Rule
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col gap-6">
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
            </CardContent>
        </Card>
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
