"use client";

import * as React from "react";
import { Modal, ModalFooter, Button, Tabs } from "@/components/ui";

interface DataModelGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function DataModelGuideModal({ isOpen, onClose }: DataModelGuideModalProps) {


    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Authorization Model Guide" className="max-w-3xl">
            <div className="p-6 space-y-6">
                <p className="text-sm text-gray-400">
                    This system uses <strong>ReBAC (Relationship-Based Access Control)</strong>.
                    Instead of just assigning static roles, you define <strong>Relationships</strong> between things.
                </p>

                <Tabs
                    defaultIndex={0}
                    tabs={[
                        {
                            label: "Basics & Entities",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">1. Entities</h3>
                                    <p className="text-sm text-gray-400">
                                        An <strong>Entity</strong> is any object in your system that needs protection.
                                        Common examples: <code>document</code>, <code>folder</code>, <code>team</code>, <code>project</code>.
                                    </p>
                                    <div className="bg-[#111921] p-4 rounded-md border border-slate-700">
                                        <code className="text-xs font-mono text-blue-300">
                                            {`// Example Entity Definition`}<br />
                                            &quot;document&quot;: &#123;<br />
                                            &nbsp;&nbsp;relations: &#123; ... &#125;,<br />
                                            &nbsp;&nbsp;permissions: &#123; ... &#125;<br />
                                            &#125;
                                        </code>
                                    </div>
                                </div>
                            )
                        },
                        {
                            label: "Relations & Inheritance",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">2. Relations (Roles)</h3>
                                    <p className="text-sm text-gray-400">
                                        Relations define <strong>how users relate to an entity</strong>.
                                        They can also define <strong>Inheritance</strong> (Role Hierarchies).
                                    </p>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-800/50 rounded border border-slate-700">
                                            <h4 className="font-semibold text-white mb-2">Direct Relation</h4>
                                            <p className="text-xs text-gray-400 mb-2">&quot;John is a viewer of Doc A&quot;</p>
                                            <code className="text-xs font-mono text-green-400">viewer: [user]</code>
                                        </div>
                                        <div className="p-4 bg-slate-800/50 rounded border border-slate-700">
                                            <h4 className="font-semibold text-white mb-2">Inheritance (Implied By)</h4>
                                            <p className="text-xs text-gray-400 mb-2">&quot;All Editors are also Viewers&quot;</p>
                                            <code className="text-xs font-mono text-blue-400">viewer: [editor]</code>
                                        </div>
                                    </div>
                                </div>
                            )
                        },
                        {
                            label: "Recursion (Identity)",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">3. Recursion (Identity vs Access)</h3>
                                    <p className="text-sm text-gray-400 mb-4">
                                        This is the most important distinction.
                                    </p>

                                    <div className="space-y-4">
                                        <div className="flex gap-4 items-start p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
                                            <div className="mt-1"><div className="w-10 h-6 bg-[#1773cf] rounded-full flex items-center p-1"><div className="bg-white w-4 h-4 rounded-full translate-x-4 shadow-sm"></div></div></div>
                                            <div>
                                                <h4 className="text-white font-medium">Recursive: ON (Identity)</h4>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Use for groups, teams, or folders where membership implies <strong>&quot;being part of&quot;</strong>.
                                                    <br />
                                                    <em>Example:</em> If I am a member of &quot;Team A&quot;, and &quot;Team A&quot; owns &quot;Project X&quot;, then <strong>I</strong> own &quot;Project X&quot;.
                                                    My identity <em>flows through</em> the group.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 items-start p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                                            <div className="mt-1"><div className="w-10 h-6 bg-slate-700 rounded-full flex items-center p-1"><div className="bg-white w-4 h-4 rounded-full shadow-sm"></div></div></div>
                                            <div>
                                                <h4 className="text-white font-medium">Recursive: OFF (Access Only)</h4>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Use for simple permissions like direct access.
                                                    <br />
                                                    <em>Example:</em> If I am a <code>viewer</code> of &quot;Doc A&quot;, I have access to read it.
                                                    But I do <strong>not</strong> become &quot;Doc A&quot;. I don&#39;t inherit its other properties.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        },
                        {
                            label: "Permissions",
                            content: (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">4. Permissions</h3>
                                    <p className="text-sm text-gray-400">
                                        Permissions are the high-level actions users check for (e.g. <code>can_read</code>, <code>can_edit</code>).
                                        They map simply to a relation.
                                    </p>
                                    <div className="bg-[#111921] p-4 rounded-md border border-slate-700">
                                        <code className="text-xs font-mono text-yellow-300">
                                            permissions: &#123;<br />
                                            &nbsp;&nbsp;&quot;read_doc&quot;: &#123;<br />
                                            &nbsp;&nbsp;&nbsp;&nbsp;relation: &quot;viewer&quot; <span className="text-slate-500">{`// Requires 'viewer' relation`}</span><br />
                                            &nbsp;&nbsp;&#125;<br />
                                            &#125;
                                        </code>
                                    </div>
                                </div>
                            )
                        },
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
