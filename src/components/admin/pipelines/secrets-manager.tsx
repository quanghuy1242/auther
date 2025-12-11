"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { SecretModal } from "./secret-modal";
import {
    getSecrets,
    createSecret,
    updateSecret,
    deleteSecret,
    type SecretInfo
} from "@/app/admin/pipelines/actions";

interface SecretsManagerProps {
    initialSecrets: SecretInfo[];
}

export function SecretsManager({ initialSecrets }: SecretsManagerProps) {
    const [secrets, setSecrets] = useState<SecretInfo[]>(initialSecrets);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSecret, setEditingSecret] = useState<SecretInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refresh secrets list
    const refreshSecrets = async () => {
        const updated = await getSecrets();
        setSecrets(updated);
    };

    // Handle create/update
    const handleSave = async (data: { name: string; value?: string; description?: string }) => {
        setIsLoading(true);
        setError(null);

        try {
            if (editingSecret) {
                // Update existing
                const result = await updateSecret(editingSecret.id, {
                    value: data.value,
                    description: data.description,
                });
                if (!result.success) {
                    setError(result.error || "Failed to update secret");
                    return;
                }
            } else {
                // Create new
                if (!data.value) {
                    setError("Value is required for new secrets");
                    return;
                }
                const result = await createSecret(data.name, data.value, data.description);
                if (!result.success) {
                    setError(result.error || "Failed to create secret");
                    return;
                }
            }

            await refreshSecrets();
            setIsModalOpen(false);
            setEditingSecret(null);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle delete
    const handleDelete = async (secret: SecretInfo) => {
        if (!confirm(`Delete secret "${secret.name}"? This cannot be undone.`)) {
            return;
        }

        setIsLoading(true);
        const result = await deleteSecret(secret.id);
        if (!result.success) {
            setError(result.error || "Failed to delete secret");
        } else {
            await refreshSecrets();
        }
        setIsLoading(false);
    };

    // Open edit modal
    const handleEdit = (secret: SecretInfo) => {
        setEditingSecret(secret);
        setError(null);
        setIsModalOpen(true);
    };

    // Open create modal
    const handleCreate = () => {
        setEditingSecret(null);
        setError(null);
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <SectionHeader
                title="Pipeline Secrets"
                description="Encrypted secrets accessible in Lua scripts via helpers.secret('KEY_NAME')"
                action={
                    <Button onClick={handleCreate} disabled={isLoading} leftIcon="add">
                        Add Secret
                    </Button>
                }
            />

            {/* Error alert */}
            {error && (
                <div className="bg-red-900/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* Secrets table */}
            {secrets.length === 0 ? (
                <div className="border border-slate-700 rounded-lg p-8 text-center">
                    <span className="material-symbols-outlined text-4xl text-slate-500 mb-2">key_off</span>
                    <p className="text-slate-400">No secrets configured</p>
                    <p className="text-sm text-slate-500 mt-1">
                        Click &quot;Add Secret&quot; to create your first secret
                    </p>
                </div>
            ) : (
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-800/50">
                            <tr>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Name</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Value</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Description</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Created</th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-slate-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {secrets.map((secret) => (
                                <tr key={secret.id} className="hover:bg-slate-800/30">
                                    <td className="px-4 py-3">
                                        <code className="bg-slate-800 px-2 py-1 rounded text-sm text-blue-400">
                                            {secret.name}
                                        </code>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-sm">
                                        •••••••••
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-sm">
                                        {secret.description || <span className="text-slate-500">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-sm">
                                        {new Date(secret.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEdit(secret)}
                                                disabled={isLoading}
                                            >
                                                <span className="material-symbols-outlined text-base">edit</span>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(secret)}
                                                disabled={isLoading}
                                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                            >
                                                <span className="material-symbols-outlined text-base">delete</span>
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            <SecretModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingSecret(null);
                    setError(null);
                }}
                onSave={handleSave}
                editingSecret={editingSecret}
                isLoading={isLoading}
                error={error}
            />
        </div>
    );
}
