"use client";

import { useState, useEffect } from "react";
import { Modal, ModalFooter, Button, Input, Label, CollapsibleSection } from "@/components/ui";
import { CodeEditor } from "./code-editor";
import type { Script } from "@/app/admin/pipelines/actions";

// Mode-specific script templates
const BLOCKING_TEMPLATE = `-- Blocking Hook Script
-- Return { allowed = true/false } to allow or deny the action
-- Access context data: context.email, context.userId, etc.

local email = context.email or ""

-- Example: Block specific email domains
if helpers.matches(email, "@blocked%.com$") then
    return { allowed = false, error = "Domain not allowed" }
end

-- Allow the action to proceed
return { allowed = true }
`;

const ASYNC_TEMPLATE = `-- Async Hook Script
-- This runs in the background after the action completes
-- Use for logging, notifications, or external integrations

helpers.log("Action completed for user: " .. (context.userId or "unknown"))

-- Example: Send to external webhook
-- helpers.fetch("https://webhook.example.com/notify", {
--     method = "POST",
--     headers = { ["Content-Type"] = "application/json" },
--     body = helpers.json_encode({ userId = context.userId })
-- })

-- No return value needed for async scripts
`;

const ENRICHMENT_TEMPLATE = `-- Enrichment Hook Script
-- Return { data = { ... } } to add extra data to the response
-- Access previous script outputs: context.outputs["script_id"], context.prev

-- Example: Add custom claims to token
local userData = {
    customClaim = "value",
    timestamp = os.time()
}

-- For chained scripts, access previous output:
-- local prevData = context.prev or {}

return { data = userData }
`;

function getDefaultTemplate(executionMode?: "blocking" | "async" | "enrichment"): string {
    switch (executionMode) {
        case "blocking":
            return BLOCKING_TEMPLATE;
        case "async":
            return ASYNC_TEMPLATE;
        case "enrichment":
            return ENRICHMENT_TEMPLATE;
        default:
            return BLOCKING_TEMPLATE;
    }
}

interface ScriptEditorModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    script: Script | null;
    executionMode?: "blocking" | "async" | "enrichment";
    hookName?: string;
    onSave: (name: string, code: string) => Promise<void>;
    onDelete: () => Promise<void>;
}

export function ScriptEditorModal({
    open,
    onOpenChange,
    script,
    executionMode,
    hookName,
    onSave,
    onDelete,
}: ScriptEditorModalProps) {
    const defaultTemplate = getDefaultTemplate(executionMode);
    const [name, setName] = useState("");
    const [code, setCode] = useState(defaultTemplate);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Initialize form when script changes
    useEffect(() => {
        if (script) {
            setName(script.name);
            setCode(script.code);
        } else {
            setName("");
            setCode(getDefaultTemplate(executionMode));
        }
        setShowDeleteConfirm(false);
    }, [script, open, executionMode]);

    const handleSave = async () => {
        if (!name.trim()) {
            return;
        }
        setIsSaving(true);
        try {
            await onSave(name.trim(), code);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete();
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    const isNew = !script;
    const formatHookLabel = (name: string) =>
        name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    return (
        <Modal
            isOpen={open}
            onClose={() => onOpenChange(false)}
            title={isNew ? "Create Script" : "Edit Script"}
            description={
                isNew
                    ? hookName
                        ? `New ${executionMode || "blocking"} script for ${formatHookLabel(hookName)}`
                        : "Create a new pipeline script with Lua code"
                    : `Editing: ${script?.name}`
            }
            size="lg"
        >
            <div className="space-y-4">
                {/* Script name */}
                <div>
                    <Label htmlFor="script-name">Script Name</Label>
                    <Input
                        id="script-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Block Disposable Emails"
                        autoFocus={isNew}
                    />
                </div>

                {/* Code editor */}
                <div>
                    <Label>Lua Code</Label>
                    <div className="mt-1.5">
                        <CodeEditor value={code} onChange={setCode} height="350px" />
                    </div>
                </div>

                {/* Helper reference */}
                <CollapsibleSection title="Context & Helpers Reference" defaultOpen={false}>
                    <div className="space-y-4">
                        {/* Context */}
                        <div>
                            <div className="text-xs font-semibold text-gray-300 mb-1.5">Context (Input Data)</div>
                            <div className="bg-[#243647]/50 p-3 rounded-md font-mono text-xs text-gray-300 space-y-1">
                                <div><code className="text-purple-400">context.email</code> - User email (signup/signin)</div>
                                <div><code className="text-purple-400">context.userId</code> - User ID</div>
                                <div><code className="text-purple-400">context.clientId</code> - OAuth client ID</div>
                                <div><code className="text-purple-400">context.trigger_event</code> - Current hook name</div>
                                <div><code className="text-purple-400">context.prev</code> - Merged data from previous layer</div>
                                <div><code className="text-purple-400">context.outputs[&quot;script_id&quot;]</code> - Specific script output (DAG)</div>
                            </div>
                        </div>

                        {/* Helpers */}
                        <div>
                            <div className="text-xs font-semibold text-gray-300 mb-1.5">Helpers</div>
                            <div className="bg-[#243647]/50 p-3 rounded-md font-mono text-xs text-gray-300 space-y-1">
                                <div><code className="text-blue-400">helpers.log(data)</code> - Write to execution log</div>
                                <div><code className="text-blue-400">helpers.hash(text, algo)</code> - SHA256/MD5 hash</div>
                                <div><code className="text-blue-400">helpers.matches(str, pattern)</code> - Lua pattern match</div>
                                <div><code className="text-blue-400">helpers.now()</code> - Current timestamp (ms)</div>
                                <div><code className="text-blue-400">helpers.env(key)</code> - Get allowed env variable</div>
                                <div><code className="text-blue-400">helpers.secret(key)</code> - Get secret from config</div>
                                <div><code className="text-blue-400">helpers.queueWebhook(event, data)</code> - Queue webhook event</div>
                                <div><code className="text-blue-400">helpers.fetch(url, opts)</code> - HTTP request (whitelisted domains only)</div>
                            </div>
                        </div>

                        {/* Return values */}
                        <div>
                            <div className="text-xs font-semibold text-gray-300 mb-1.5">Return Values</div>
                            <div className="bg-[#243647]/50 p-3 rounded-md font-mono text-xs text-gray-300 space-y-1">
                                <div><code className="text-green-400">{"{ allowed = true }"}</code> - Continue execution</div>
                                <div><code className="text-red-400">{"{ allowed = false, error = \"reason\" }"}</code> - Block (abort flow)</div>
                                <div><code className="text-yellow-400">{"{ allowed = true, data = { ... } }"}</code> - Enrich (merge data)</div>
                            </div>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Actions */}
                <ModalFooter>
                    {/* Delete button (only for existing scripts) */}
                    <div className="flex-1">
                        {!isNew && !showDeleteConfirm && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="text-red-400 hover:text-red-300"
                            >
                                Delete
                            </Button>
                        )}
                        {showDeleteConfirm && (
                            <div className="flex gap-2 items-center">
                                <span className="text-xs text-red-400">Are you sure?</span>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? "Deleting..." : "Yes, delete"}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowDeleteConfirm(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Save / Cancel */}
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            disabled={isSaving || !name.trim()}
                        >
                            {isSaving ? "Saving..." : isNew ? "Create" : "Save Changes"}
                        </Button>
                    </div>
                </ModalFooter>
            </div>
        </Modal>
    );
}
