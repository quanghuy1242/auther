"use client";

import * as React from "react";
import { Input, Icon, Select, Textarea, Switch, Alert, Button } from "@/components/ui";
import { validatePolicyScript } from "@/app/admin/clients/[id]/access/actions";
import { TestPolicyModal } from "./test-policy-modal";

interface PermissionRowProps {
    name: string;
    requiredRelation: string;
    policyEnabled: boolean;
    policy: string;
    availableRelations: string[];
    onNameChange: (name: string) => void;
    onRelationChange: (relation: string) => void;
    onPolicyEnabledChange: (enabled: boolean) => void;
    onPolicyChange: (policy: string) => void;
    onRemove: () => void;
    disabled?: boolean;
}

export function PermissionRow({
    name,
    requiredRelation,
    policyEnabled,
    policy,
    availableRelations,
    onNameChange,
    onRelationChange,
    onPolicyEnabledChange,
    onPolicyChange,
    onRemove,
    disabled,
}: PermissionRowProps) {
    const [validationError, setValidationError] = React.useState<string | null>(null);
    const [validationWarnings, setValidationWarnings] = React.useState<string[]>([]);
    const [isValidating, setIsValidating] = React.useState(false);
    const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

    // Test modal state
    const [isTestModalOpen, setIsTestModalOpen] = React.useState(false);

    // Debounced validation
    React.useEffect(() => {
        if (!policyEnabled || !policy.trim()) {
            setValidationError(null);
            setValidationWarnings([]);
            return;
        }

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(async () => {
            setIsValidating(true);
            try {
                const result = await validatePolicyScript(policy);
                setValidationError(result.valid ? null : (result.error ?? "Invalid script"));
                setValidationWarnings(result.warnings ?? []);
            } catch {
                setValidationError("Validation failed");
            } finally {
                setIsValidating(false);
            }
        }, 500);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [policy, policyEnabled]);

    return (
        <>
            <div className="p-3 rounded bg-[#1A2530]/50 border border-slate-700/50 hover:border-slate-600 transition-colors space-y-3">
                {/* Top Row: Name, Relation, Delete */}
                <div className="flex items-start gap-3">
                    {/* Permission Name */}
                    <div className="flex-1 space-y-1">
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                            Permission Name
                        </label>
                        <Input
                            value={name}
                            onChange={(e) => onNameChange(e.target.value)}
                            placeholder="e.g. read"
                            className="h-8 text-sm font-mono bg-[#111921] border-slate-700"
                            disabled={disabled}
                        />
                    </div>

                    {/* Required Relation */}
                    <div className="flex-1 space-y-1">
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                            Requires Relation
                        </label>
                        <Select
                            value={requiredRelation}
                            onChange={onRelationChange}
                            options={availableRelations.map(rel => ({ value: rel, label: rel }))}
                            placeholder="Select a relation..."
                            triggerClassName="h-8 py-1 text-sm font-mono bg-[#111921] border-slate-700"
                            disabled={disabled}
                        />
                    </div>

                    {/* Delete Button */}
                    <div className="pt-6">
                        <button
                            onClick={onRemove}
                            disabled={disabled}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete Permission"
                        >
                            <Icon name="delete" size="sm" />
                        </button>
                    </div>
                </div>

                {/* ABAC Policy Section */}
                <div className="border-t border-slate-700/50 pt-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Icon name="policy" size="sm" className="text-purple-400" />
                            <span className="text-xs font-medium text-gray-300">ABAC Policy (Lua)</span>
                            {isValidating && (
                                <span className="text-[10px] text-gray-500 animate-pulse">Validating...</span>
                            )}
                        </div>
                        <Switch
                            checked={policyEnabled}
                            onChange={onPolicyEnabledChange}
                            disabled={disabled}
                        />
                    </div>

                    {policyEnabled && (
                        <div className="space-y-2">
                            <Textarea
                                value={policy}
                                onChange={(e) => onPolicyChange(e.target.value)}
                                placeholder="return context.resource.amount < 1000"
                                className={`h-20 text-xs font-mono bg-[#111921] ${validationError ? 'border-red-500' : 'border-slate-700'}`}
                                containerClassName="space-y-0"
                                disabled={disabled}
                            />
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    {validationError && (
                                        <Alert variant="error" className="py-1 px-2 text-[10px]">
                                            {validationError}
                                        </Alert>
                                    )}
                                    {validationWarnings.length > 0 && !validationError && (
                                        <Alert variant="warning" className="py-1 px-2 text-[10px]">
                                            {validationWarnings.join("; ")}
                                        </Alert>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] h-6 px-2 ml-2"
                                    onClick={() => setIsTestModalOpen(true)}
                                    disabled={!policy.trim() || !!validationError}
                                >
                                    <Icon name="play_arrow" size="sm" className="mr-1" />
                                    Test
                                </Button>
                            </div>
                            <p className="text-[10px] text-gray-500">
                                Lua script. Available: <code className="bg-slate-800 px-1 rounded">context.resource</code>, <code className="bg-slate-800 px-1 rounded">context.user</code>. Return <code className="bg-slate-800 px-1 rounded">true</code> to allow.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Test Policy Modal */}
            <TestPolicyModal
                isOpen={isTestModalOpen}
                onClose={() => setIsTestModalOpen(false)}
                script={policy}
            />
        </>
    );
}
