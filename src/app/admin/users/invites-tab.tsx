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
    CopyableInput,
} from "@/components/ui";
import { toast } from "sonner";
import type {
    InviteWithContext,
    RegistrationContext,
} from "./invites-actions";
import {
    getPlatformInvites,
    getAvailableContexts,
    createInvite,
    deleteInvite,
} from "./invites-actions";

export function InvitesTab() {
    const [invites, setInvites] = React.useState<InviteWithContext[]>([]);
    const [contexts, setContexts] = React.useState<RegistrationContext[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [showCreate, setShowCreate] = React.useState(false);
    const [showInviteUrl, setShowInviteUrl] = React.useState(false);
    const [inviteUrl, setInviteUrl] = React.useState("");
    const [creating, setCreating] = React.useState(false);

    // Form state
    const [email, setEmail] = React.useState("");
    const [contextSlug, setContextSlug] = React.useState("");
    const [expiresInDays, setExpiresInDays] = React.useState("7");

    // Load data
    React.useEffect(() => {
        async function load() {
            try {
                const [invs, ctxs] = await Promise.all([
                    getPlatformInvites(),
                    getAvailableContexts(),
                ]);
                setInvites(invs);
                setContexts(ctxs);
            } catch (error) {
                console.error("Failed to load invites:", error);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    async function handleCreate() {
        if (!email.trim()) {
            toast.error("Email is required");
            return;
        }
        if (!contextSlug) {
            toast.error("Please select a registration context");
            return;
        }

        setCreating(true);
        try {
            const result = await createInvite({
                email: email.trim(),
                contextSlug,
                expiresInDays: parseInt(expiresInDays) || 7,
            });
            if (result.success && result.inviteUrl) {
                toast.success("Invite created");
                setShowCreate(false);
                resetForm();
                setInviteUrl(result.inviteUrl);
                setShowInviteUrl(true);
                // Reload invites
                setInvites(await getPlatformInvites());
            } else {
                toast.error(result.error || "Failed to create invite");
            }
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(inviteId: string) {
        if (!confirm("Are you sure you want to delete this invite?")) return;

        const result = await deleteInvite(inviteId);
        if (result.success) {
            toast.success("Invite deleted");
            setInvites(await getPlatformInvites());
        } else {
            toast.error(result.error || "Failed to delete");
        }
    }

    function resetForm() {
        setEmail("");
        setContextSlug("");
        setExpiresInDays("7");
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-neutral-500">Loading invites...</div>
            </div>
        );
    }

    const pendingInvites = invites.filter(i => !i.consumedAt && new Date(i.expiresAt) > new Date());
    const expiredInvites = invites.filter(i => !i.consumedAt && new Date(i.expiresAt) <= new Date());
    const consumedInvites = invites.filter(i => i.consumedAt);

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Icon name="mail" className="h-5 w-5" />
                                Platform Invites
                            </CardTitle>
                            <CardDescription>
                                Manage registration invitations for platform access
                            </CardDescription>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon="add"
                            onClick={() => setShowCreate(true)}
                            disabled={contexts.length === 0}
                        >
                            Create Invite
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {contexts.length === 0 ? (
                        <div className="text-center py-8 text-neutral-500">
                            <Icon name="warning" className="h-8 w-8 mx-auto mb-2 opacity-50 text-amber-500" />
                            <p>No registration contexts available</p>
                            <p className="text-sm">Create a platform registration context first</p>
                        </div>
                    ) : invites.length > 0 ? (
                        <div className="space-y-6">
                            {/* Pending Invites */}
                            {pendingInvites.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-neutral-400 mb-2">
                                        Pending ({pendingInvites.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {pendingInvites.map((invite) => (
                                            <InviteRow
                                                key={invite.id}
                                                invite={invite}
                                                onDelete={handleDelete}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Expired Invites */}
                            {expiredInvites.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-neutral-400 mb-2">
                                        Expired ({expiredInvites.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {expiredInvites.map((invite) => (
                                            <InviteRow
                                                key={invite.id}
                                                invite={invite}
                                                onDelete={handleDelete}
                                                expired
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Consumed Invites */}
                            {consumedInvites.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-neutral-400 mb-2">
                                        Used ({consumedInvites.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {consumedInvites.map((invite) => (
                                            <InviteRow
                                                key={invite.id}
                                                invite={invite}
                                                onDelete={handleDelete}
                                                consumed
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-neutral-500">
                            <Icon name="mail" className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No invites yet</p>
                            <p className="text-sm">Create invites to onboard new users</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Invite Modal */}
            <Modal
                isOpen={showCreate}
                onClose={() => { setShowCreate(false); resetForm(); }}
                title="Create Invite"
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="invite-email">Email Address</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user@example.com"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Registration Context</Label>
                        <Select
                            value={contextSlug}
                            onChange={(v) => setContextSlug(v)}
                            options={[
                                { value: "", label: "Select a context..." },
                                ...contexts.map(c => ({
                                    value: c.slug,
                                    label: c.name,
                                })),
                            ]}
                        />
                        <p className="text-xs text-neutral-500">
                            The context determines what permissions the user receives
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Expires In</Label>
                        <Select
                            value={expiresInDays}
                            onChange={(v) => setExpiresInDays(v)}
                            options={[
                                { value: "1", label: "1 day" },
                                { value: "3", label: "3 days" },
                                { value: "7", label: "7 days" },
                                { value: "14", label: "14 days" },
                                { value: "30", label: "30 days" },
                            ]}
                        />
                    </div>
                </div>
                <ModalFooter>
                    <Button variant="secondary" onClick={() => { setShowCreate(false); resetForm(); }}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleCreate} disabled={creating}>
                        {creating ? "Creating..." : "Create Invite"}
                    </Button>
                </ModalFooter>
            </Modal>

            {/* Invite URL Modal */}
            <Modal
                isOpen={showInviteUrl}
                onClose={() => setShowInviteUrl(false)}
                title="Invite Created"
            >
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <Icon name="check_circle" className="text-green-500 text-2xl shrink-0" />
                        <div className="text-sm text-green-200">
                            <strong className="block mb-1">Invite link created!</strong>
                            Share this link with the user. They will use it to register their account.
                        </div>
                    </div>
                    <CopyableInput
                        id="invite-url"
                        label="Invite Link"
                        value={inviteUrl}
                        labelClassName="text-gray-400"
                    />
                </div>
                <ModalFooter>
                    <Button variant="primary" onClick={() => setShowInviteUrl(false)}>
                        Done
                    </Button>
                </ModalFooter>
            </Modal>
        </>
    );
}

// Helper component for invite row
function InviteRow({
    invite,
    onDelete,
    expired,
    consumed,
}: {
    invite: InviteWithContext;
    onDelete: (id: string) => void;
    expired?: boolean;
    consumed?: boolean;
}) {
    return (
        <div className={`flex items-center justify-between py-3 px-4 rounded-lg border ${consumed
                ? "border-green-500/30 bg-green-500/10"
                : expired
                    ? "border-neutral-600 bg-neutral-800/30 opacity-60"
                    : "border-neutral-700 bg-neutral-800/50"
            }`}>
            <div className="flex items-center gap-3">
                <Icon
                    name={consumed ? "check_circle" : expired ? "schedule" : "mail"}
                    className={`h-5 w-5 ${consumed ? "text-green-500" : expired ? "text-neutral-500" : "text-blue-400"}`}
                />
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{invite.email}</span>
                        {invite.contextName && (
                            <Badge variant="info" className="text-xs">{invite.contextName}</Badge>
                        )}
                    </div>
                    <p className="text-xs text-neutral-500">
                        {consumed
                            ? `Used ${new Date(invite.consumedAt!).toLocaleDateString()}`
                            : expired
                                ? `Expired ${new Date(invite.expiresAt).toLocaleDateString()}`
                                : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                    </p>
                </div>
            </div>
            {!consumed && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(invite.id)}
                >
                    <Icon name="delete" className="h-4 w-4 text-red-500" />
                </Button>
            )}
        </div>
    );
}
