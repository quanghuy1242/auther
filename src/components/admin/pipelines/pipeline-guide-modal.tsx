"use client";

import * as React from "react";
import { Modal, ModalFooter, Button, Tabs, Icon } from "@/components/ui";

interface PipelineGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function PipelineGuideModal({ isOpen, onClose }: PipelineGuideModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Pipeline Execution Guide" className="max-w-3xl">
            <div className="p-6 space-y-6">
                <p className="text-sm text-gray-400">
                    Pipelines allow you to chain Lua scripts to customize authentication flows.
                    Scripts are organized into <strong>Layers</strong> executed sequentially.
                </p>

                <Tabs
                    defaultIndex={0}
                    tabs={[
                        {
                            label: "Execution Flow (Parallel)",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">1. Layers & Parallelism</h3>
                                    <p className="text-sm text-gray-400">
                                        The pipeline runs from <strong>Top to Bottom</strong> (Layer 1 → Layer 2 → Layer 3).
                                    </p>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-800/50 rounded border border-slate-700">
                                            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                                                <Icon name="layers" size="sm" className="text-blue-400" /> Vertical Order
                                            </h4>
                                            <p className="text-xs text-gray-400">
                                                Layers run <strong>sequentially</strong>.
                                                Layer 2 waits for ALL scripts in Layer 1 to finish before starting.
                                            </p>
                                        </div>
                                        <div className="p-4 bg-slate-800/50 rounded border border-slate-700">
                                            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                                                <Icon name="bolt" size="sm" className="text-yellow-400" /> Horizontal Parallel
                                            </h4>
                                            <p className="text-xs text-gray-400">
                                                Scripts in the <strong>same layer</strong> run <strong>in parallel</strong>.
                                                They execute simultaneously and cannot see each others data.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-[#111921] p-4 rounded-md border border-slate-700">
                                        <code className="text-xs font-mono text-blue-300">
                                            User Signup Triggered<br />
                                            &nbsp;&nbsp;↓<br />
                                            [ Audit Log ]  &  [ Notify Slack ]  <span className="text-gray-500">{"// Run together (Parallel)"}</span><br />
                                            &nbsp;&nbsp;↓ <span className="text-gray-500">{"// Wait for both"}</span><br />
                                            [ Enrich User Data ] <span className="text-gray-500">{"// Step 2 (Sequential)"}</span>
                                        </code>
                                    </div>
                                </div>
                            )
                        },
                        {
                            label: "Execution Modes",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">2. Hook Modes</h3>
                                    <p className="text-sm text-gray-400">
                                        Different hooks operate in different modes, affecting how they handle script results.
                                    </p>

                                    <div className="space-y-3">
                                        <div className="flex gap-4 items-start p-3 bg-red-900/10 border border-red-900/30 rounded-lg">
                                            <div className="mt-1"><span className="text-[10px] font-bold uppercase bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded">Blocking</span></div>
                                            <div>
                                                <h4 className="text-white text-sm font-medium">Blocking Mode</h4>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Can <strong>abort the flow</strong>. If a script returns <code>allowed: false</code>, the entire request is rejected immediately.
                                                    <br />Used for: <code>before_signup</code>, <code>before_signin</code>.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 items-start p-3 bg-green-900/10 border border-green-900/30 rounded-lg">
                                            <div className="mt-1"><span className="text-[10px] font-bold uppercase bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded">Async</span></div>
                                            <div>
                                                <h4 className="text-white text-sm font-medium">Async (Fire-and-Forget)</h4>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Runs in the background. Does not block the main request.
                                                    Errors are logged but ignored.
                                                    <br />Used for: <code>after_signup</code>, <code>after_signin</code>.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 items-start p-3 bg-blue-900/10 border border-blue-900/30 rounded-lg">
                                            <div className="mt-1"><span className="text-[10px] font-bold uppercase bg-blue-900/40 text-blue-400 px-1.5 py-0.5 rounded">Enrichment</span></div>
                                            <div>
                                                <h4 className="text-white text-sm font-medium">Enrichment Mode</h4>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Waits for completion. The returned <code>data</code> is merged into the user session or token.
                                                    <br />Used for: <code>on_enrich_token</code>.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        },
                        {
                            label: "Context & Data",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">3. Shared Data Context</h3>
                                    <p className="text-sm text-gray-400">
                                        Data flows from top to bottom. Use the <code>context</code> global to access data.
                                    </p>

                                    <div className="bg-[#111921] p-4 rounded-md border border-slate-700 font-mono text-xs">
                                        <div className="mb-3">
                                            <span className="text-purple-400">context.user</span>: <span className="text-gray-400">The current user (if logged in)</span>
                                        </div>
                                        <div className="mb-3">
                                            <span className="text-green-400">context.prev</span>: <span className="text-gray-400">Merged output from ALL scripts in the previous layer.</span>
                                        </div>
                                        <div>
                                            <span className="text-yellow-400">context.outputs[&quot;script-id&quot;]</span>: <span className="text-gray-400">Access output of a specific script node.</span>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-blue-900/20 rounded border border-blue-800 text-xs text-blue-200">
                                        <strong>Tip:</strong> In parallel execution (same layer), scripts cannot see each others data because they run at the same time.
                                    </div>
                                </div>
                            )
                        }
                    ]}
                />
            </div>
            <ModalFooter>
                <Button variant="primary" onClick={onClose} className="w-full sm:w-auto">
                    Got it
                </Button>
            </ModalFooter>
        </Modal>
    );
}
