"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { SecretInfo } from "@/app/admin/pipelines/actions";

interface SecretModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { name: string; value?: string; description?: string }) => Promise<void>;
    editingSecret: SecretInfo | null;
    isLoading: boolean;
    error: string | null;
}

export function SecretModal({
    isOpen,
    onClose,
    onSave,
    editingSecret,
    isLoading,
    error,
}: SecretModalProps) {
    const [name, setName] = useState("");
    const [value, setValue] = useState("");
    const [description, setDescription] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);

    // Reset form when modal opens/closes or editing secret changes
    useEffect(() => {
        if (!isOpen) return;

        // Defer state sync to avoid synchronous setState warnings inside effects
        queueMicrotask(() => {
            if (editingSecret) {
                setName(editingSecret.name);
                setValue(""); // Don't pre-fill value for security
                setDescription(editingSecret.description || "");
            } else {
                setName("");
                setValue("");
                setDescription("");
            }
            setLocalError(null);
        });
    }, [isOpen, editingSecret]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        // Validate
        if (!editingSecret && !name.trim()) {
            setLocalError("Name is required");
            return;
        }
        if (!editingSecret && !value.trim()) {
            setLocalError("Value is required for new secrets");
            return;
        }

        await onSave({
            name: name.trim(),
            value: value.trim() || undefined,
            description: description.trim() || undefined,
        });
    };

    const isEditing = !!editingSecret;
    const displayError = localError || error;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? "Edit Secret" : "Add Secret"}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {displayError && (
                    <div className="bg-red-900/20 border border-red-500/30 text-red-400 px-3 py-2 rounded text-sm">
                        {displayError}
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="secret-name">Name</Label>
                    <Input
                        id="secret-name"
                        value={name}
                        onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                        placeholder="STRIPE_KEY"
                        disabled={isEditing || isLoading}
                        autoComplete="off"
                    />
                    <p className="text-slate-500 text-xs">
                        Uppercase letters, numbers, and underscores only
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="secret-value">
                        Value {isEditing && <span className="text-slate-500 font-normal">(leave empty to keep current)</span>}
                    </Label>
                    <Input
                        id="secret-value"
                        type="password"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={isEditing ? "Enter new value to change" : "Enter secret value"}
                        disabled={isLoading}
                        autoComplete="new-password"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="secret-description">Description (optional)</Label>
                    <Textarea
                        id="secret-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What is this secret used for?"
                        rows={2}
                        disabled={isLoading}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? "Saving..." : isEditing ? "Update" : "Create"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

