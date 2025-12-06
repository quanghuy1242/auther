"use client";

import * as React from "react";
import { Modal, Button, Textarea, Alert } from "@/components/ui";
import { testPolicyScript } from "@/app/admin/clients/[id]/access/actions";

export const DEFAULT_TEST_CONTEXT = `{
  "resource": {
    "id": "test_123",
    "type": "invoice",
    "amount": 500,
    "status": "draft"
  },
  "user": {
    "id": "user_abc",
    "role": "editor"
  }
}`;

interface TestPolicyModalProps {
    isOpen: boolean;
    onClose: () => void;
    script: string;
}

/**
 * Modal for testing ABAC Lua policies with sample context.
 * Provides a JSON context editor and displays the evaluation result.
 */
export function TestPolicyModal({ isOpen, onClose, script }: TestPolicyModalProps) {
    const [testContext, setTestContext] = React.useState(DEFAULT_TEST_CONTEXT);
    const [testResult, setTestResult] = React.useState<{
        success: boolean;
        result?: boolean;
        error?: string;
    } | null>(null);
    const [isTesting, setIsTesting] = React.useState(false);

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const context = JSON.parse(testContext);
            const result = await testPolicyScript(script, context);
            setTestResult({ success: true, ...result });
        } catch (e) {
            setTestResult({
                success: false,
                error: e instanceof Error ? e.message : "Invalid JSON context",
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleClose = () => {
        setTestResult(null);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Test ABAC Policy"
            size="lg"
        >
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-medium text-gray-300 block mb-1">Policy Script</label>
                    <pre className="text-xs font-mono bg-[#111921] p-2 rounded border border-slate-700 overflow-x-auto">
                        {script}
                    </pre>
                </div>

                <div>
                    <label className="text-xs font-medium text-gray-300 block mb-1">Test Context (JSON)</label>
                    <Textarea
                        value={testContext}
                        onChange={(e) => setTestContext(e.target.value)}
                        className="h-40 text-xs font-mono bg-[#111921] border-slate-700"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                        Edit the context to test different scenarios. The policy will have access to <code className="bg-slate-800 px-1 rounded">context.resource</code> and <code className="bg-slate-800 px-1 rounded">context.user</code>.
                    </p>
                </div>

                {testResult && (
                    <Alert variant={testResult.success ? (testResult.result ? "success" : "warning") : "error"}>
                        {testResult.success
                            ? (testResult.result ? "✅ Policy returned TRUE (access allowed)" : "❌ Policy returned FALSE (access denied)")
                            : `⚠️ Error: ${testResult.error}`
                        }
                    </Alert>
                )}

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={handleClose}>Close</Button>
                    <Button variant="primary" onClick={handleTest} disabled={isTesting}>
                        {isTesting ? "Testing..." : "Run Test"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
