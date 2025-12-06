"use client";

import * as React from "react";
import { Modal, ModalFooter, Button, Tabs, CopyableField, Alert } from "@/components/ui";

interface AccessControlGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AccessControlGuideModal({ isOpen, onClose }: AccessControlGuideModalProps) {
    const apiHost = "https://auth.quanghuy.dev";

    const endpoints = {
        exchange: `${apiHost}/api/auth/api-key/exchange`,
        check: `${apiHost}/api/auth/check-permission`,
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Access Control Documentation"
            className="max-w-4xl"
        >
            <div className="p-6 space-y-6">
                <p className="text-sm text-gray-400">
                    This system provides a hybrid <strong>Role-Based (RBAC)</strong> and <strong>Relationship-Based (ReBAC)</strong> access control model.
                    It secures both the <strong>Platform</strong> (management dashboard) and your <strong>Resources</strong> (via API).
                </p>

                <Tabs
                    defaultIndex={0}
                    tabs={[
                        {
                            label: "Overview",
                            content: (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                            <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-blue-400">admin_panel_settings</span>
                                                Platform Access
                                            </h3>
                                            <p className="text-sm text-gray-400">
                                                Controls who can access this <strong>Admin Dashboard</strong>.
                                                <br />
                                                Uses high-level roles: <strong>Owner</strong>, <strong>Admin</strong>, <strong>User</strong>.
                                                <br />
                                                <em>Who can manage the client settings?</em>
                                            </p>
                                        </div>
                                        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                            <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-green-400">lock_person</span>
                                                Scoped Permissions
                                            </h3>
                                            <p className="text-sm text-gray-400">
                                                Controls access to <strong>Your App&apos;s Resources</strong>.
                                                <br />
                                                Uses fine-grained relations: <strong>Viewer</strong>, <strong>Editor</strong>, etc.
                                                <br />
                                                <em>Who can read Document #123?</em>
                                            </p>
                                        </div>
                                    </div>

                                    <Alert title="Data Model" variant="info">
                                        The <strong>Data Model</strong> tab defines the &quot;grammar&quot; for Scoped Permissions (e.g., what is a &quot;document&quot;? what is a &quot;viewer&quot;?).
                                    </Alert>
                                </div>
                            )
                        },
                        {
                            label: "API Usage",
                            content: (
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-lg font-medium text-white mb-2">1. API Key Exchange</h3>
                                        <p className="text-sm text-gray-400 mb-3">
                                            API Keys are long-lived credentials. For better security and performance, <strong>exchange them for a short-lived Bearer Token</strong>.
                                        </p>
                                        <div className="bg-[#111921] p-4 rounded-lg border border-slate-700 space-y-3">
                                            <div className="space-y-1">
                                                <span className="text-xs uppercase text-gray-500 font-semibold tracking-wider">Request</span>
                                                <CopyableField
                                                    value={`curl -X POST ${endpoints.exchange} \\
  -H "x-api-key: <YOUR_API_KEY>"`}
                                                    label=""
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-xs uppercase text-gray-500 font-semibold tracking-wider">Response</span>
                                                <pre className="text-xs bg-slate-900 p-3 rounded text-green-400 overflow-x-auto">
                                                    {`{
  "token": "eyJhbGciOiJIUzI1Ni...",
  "expires_in": 3600
}`}
                                                </pre>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium text-white mb-2">2. Check Permission</h3>
                                        <p className="text-sm text-gray-400 mb-3">
                                            Use the <strong>Bearer Token</strong> (or API Key directly) to check permissions at runtime.
                                        </p>
                                        <div className="bg-[#111921] p-4 rounded-lg border border-slate-700 space-y-3">
                                            <div className="space-y-1">
                                                <span className="text-xs uppercase text-gray-500 font-semibold tracking-wider">Request</span>
                                                <CopyableField
                                                    value={`curl -X POST ${endpoints.check} \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entityType": "document",
    "entityId": "doc-123",
    "permission": "view"
  }'`}
                                                    label=""
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-xs uppercase text-gray-500 font-semibold tracking-wider">Response</span>
                                                <pre className="text-xs bg-slate-900 p-3 rounded text-green-400 overflow-x-auto">
                                                    {`{
  "allowed": true,
  "entityType": "document",
  "entityId": "doc-123",
  ...
}`}
                                                </pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        },
                        {
                            label: "Platform Access",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">Platform Roles</h3>
                                    <div className="space-y-3">
                                        <div className="p-3 bg-slate-800 rounded border-l-4 border-purple-500">
                                            <div className="font-semibold text-white">Owner</div>
                                            <div className="text-xs text-gray-400">Full access. Can delete the client, manage billing, and manage all access.</div>
                                        </div>
                                        <div className="p-3 bg-slate-800 rounded border-l-4 border-blue-500">
                                            <div className="font-semibold text-white">Admin</div>
                                            <div className="text-xs text-gray-400">Can manage settings and access, but cannot delete the client or critical infrastructure.</div>
                                        </div>
                                        <div className="p-3 bg-slate-800 rounded border-l-4 border-slate-500">
                                            <div className="font-semibold text-white">User</div>
                                            <div className="text-xs text-gray-400">Read-only access to the dashboard.</div>
                                        </div>
                                    </div>
                                </div>
                            )
                        },
                        {
                            label: "Scoped & ReBAC",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">Scoped Permissions (ReBAC)</h3>
                                    <p className="text-sm text-gray-400">
                                        These permissions are <strong>resource-specific</strong>. They are defined by the <strong>Data Model</strong>.
                                    </p>

                                    <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                                        <h4 className="text-white text-sm font-semibold mb-2">How it works:</h4>
                                        <ol className="list-decimal list-inside text-sm text-gray-400 space-y-2">
                                            <li>Define your <strong>Model</strong> (e.g. Document has &apos;viewers&apos;).</li>
                                            <li>Grant a <strong>Permission</strong> (e.g. User Alice is a &apos;viewer&apos; of Document A).</li>
                                            <li>Check via <strong>API</strong> (e.g. &quot;Can Alice view Document A?&quot;).</li>
                                        </ol>
                                    </div>

                                    <Alert variant="warning" title="Note">
                                        Scoped permissions relate to your application&apos;s data, not the Admin Dashboard itself.
                                    </Alert>
                                </div>
                            )
                        }
                    ]}
                />
            </div>
            <ModalFooter>
                <Button variant="primary" onClick={onClose} className="w-full sm:w-auto">
                    Close Documentation
                </Button>
            </ModalFooter>
        </Modal>
    );
}
