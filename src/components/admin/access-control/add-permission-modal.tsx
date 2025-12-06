"use client";

import * as React from "react";
import {
  Modal,
  ModalFooter,
  Button,
  Select,
  Input,
  Textarea,
  Icon,
  Tabs,
  Badge,
  Alert
} from "@/components/ui";
import { UserGroupPicker } from "@/components/ui/user-group-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SubjectCard } from "@/components/ui/subject-card";
import { validatePolicyScript } from "@/app/admin/clients/[id]/access/actions";
import { TestPolicyModal } from "./shared/test-policy-modal";

// Types matching the system
export interface ScopedPermission {
  id: string;
  resourceType: string;
  resourceId: string;
  relation: string;
  subject: {
    id: string;
    name: string;
    type: "User" | "Group" | "ApiKey";
    description?: string;
    avatarUrl?: string;
  };
  condition?: string;
}

export interface ApiKey {
  id: string;
  keyId: string;
  owner: string;
  created: string;
  expires: string;
  permissions: string;
  status: "Active" | "Revoked";
}

interface AddPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (permissions: Partial<ScopedPermission>[]) => void;
  /** Array of permissions to edit (all for same subject) */
  initialPermissions?: ScopedPermission[];
  fixedSubject?: {
    id: string;
    name: string;
    type: "User" | "Group" | "ApiKey";
    description?: string;
    avatarUrl?: string
  };
  resourceConfig?: Record<string, string[]>;
  apiKeys?: ApiKey[];
}

type ScopeType = "global" | "specific" | "script";

interface PermissionRule {
  key: string;
  resourceType: string;
  scopeType: ScopeType;
  resourceId: string; // Used for specific IDs OR Script content
  relation: string;
}

export function AddPermissionModal({
  isOpen,
  onClose,
  onSave,
  initialPermissions,
  fixedSubject,
  resourceConfig = {},
  apiKeys = [],
}: AddPermissionModalProps) {
  // --- State ---
  const [subjectType, setSubjectType] = React.useState<"User" | "Group" | "ApiKey">("User");
  const [selectedSubject, setSelectedSubject] = React.useState<{
    id: string;
    name: string | null;
    description?: string;
    avatarUrl?: string;
    type?: string;
  } | null>(null);
  const [rules, setRules] = React.useState<PermissionRule[]>([]);

  // Picker State
  const [isUserGroupPickerOpen, setIsUserGroupPickerOpen] = React.useState(false);

  // Script validation state
  const [scriptErrors, setScriptErrors] = React.useState<Record<string, string | null>>({});
  const [isValidatingScript, setIsValidatingScript] = React.useState<string | null>(null);
  const scriptValidationTimeouts = React.useRef<Record<string, NodeJS.Timeout>>({});

  // Test modal state - just track which rule is being tested
  const [testModalKey, setTestModalKey] = React.useState<string | null>(null);

  const availableResourceTypes = React.useMemo(() => Object.keys(resourceConfig), [resourceConfig]);

  // Helper to create empty rule - defined before useEffect that uses it
  const createEmptyRule = React.useCallback((): PermissionRule => {
    const firstResource = availableResourceTypes[0] || "";
    return {
      key: Math.random().toString(36).substr(2, 9),
      resourceType: firstResource,
      scopeType: "global",
      resourceId: "",
      relation: (firstResource && resourceConfig[firstResource]?.[0]) || ""
    };
  }, [availableResourceTypes, resourceConfig]);

  // --- Initialization ---
  React.useEffect(() => {
    if (initialPermissions && initialPermissions.length > 0) {
      // Edit Mode - load all permissions for this subject
      const firstPerm = initialPermissions[0];
      setSubjectType(firstPerm.subject.type);
      setSelectedSubject({
        id: firstPerm.subject.id,
        name: firstPerm.subject.name,
        description: firstPerm.subject.description,
        avatarUrl: firstPerm.subject.avatarUrl,
        type: firstPerm.subject.type
      });

      // Convert each permission to a rule
      const loadedRules: PermissionRule[] = initialPermissions.map((perm, idx) => {
        let scope: ScopeType = "global";
        let content = "";
        if (perm.condition) {
          scope = "script";
          content = perm.condition;
        } else if (perm.resourceId !== "*") {
          scope = "specific";
          content = perm.resourceId;
        }

        return {
          key: `loaded-${idx}`,
          resourceType: perm.resourceType,
          scopeType: scope,
          resourceId: content,
          relation: perm.relation
        };
      });

      setRules(loadedRules);
    } else {
      // Create Mode
      if (fixedSubject) {
        setSubjectType(fixedSubject.type);
        setSelectedSubject(fixedSubject);
      } else {
        setSubjectType("User");
        setSelectedSubject(null);
      }
      setRules([createEmptyRule()]);
    }
  }, [initialPermissions, isOpen, fixedSubject, createEmptyRule]);

  // --- Handlers ---
  const handleAddRule = () => {
    setRules([...rules, createEmptyRule()]);
  };

  const handleRemoveRule = (key: string) => {
    if (rules.length > 1) {
      setRules(rules.filter(r => r.key !== key));
    }
  };

  const updateRule = (key: string, updates: Partial<PermissionRule>) => {
    setRules(rules.map(r => {
      if (r.key !== key) return r;

      const updated = { ...r, ...updates };
      // Reset relation if resource type changes
      if (updates.resourceType && updates.resourceType !== r.resourceType) {
        const rels = resourceConfig[updates.resourceType] || [];
        updated.relation = rels[0] || "";
      }
      return updated;
    }));
  };

  const handleSubjectTypeChange = (type: "User" | "Group" | "ApiKey") => {
    setSubjectType(type);
    setSelectedSubject(null);
  };

  const handleSubmit = () => {
    if (!selectedSubject) return;

    const payload: Partial<ScopedPermission>[] = [];

    rules.forEach((rule, index) => {
      // Try to preserve the permission ID if editing the same index
      const originalPerm = initialPermissions?.[index];
      const isEditing = !!initialPermissions && initialPermissions.length > 0;

      const commonSubject = {
        id: selectedSubject.id,
        name: selectedSubject.name || "",
        type: subjectType,
        description: selectedSubject.description,
        avatarUrl: selectedSubject.avatarUrl
      };

      if (rule.scopeType === "script") {
        if (!rule.resourceId.trim()) return;
        payload.push({
          id: originalPerm?.id,
          resourceType: rule.resourceType,
          resourceId: "*",
          relation: rule.relation,
          condition: rule.resourceId,
          subject: commonSubject
        });
      } else if (rule.scopeType === "specific") {
        const ids = rule.resourceId.split(",").map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) return;

        ids.forEach((id, idIndex) => {
          // Only preserve ID for the first ID if single rule edit
          const preserveId = idIndex === 0 && originalPerm;
          payload.push({
            id: preserveId ? originalPerm?.id : undefined,
            resourceType: rule.resourceType,
            resourceId: id,
            relation: rule.relation,
            subject: commonSubject
          });
        });
      } else {
        // Global
        payload.push({
          id: originalPerm?.id,
          resourceType: rule.resourceType,
          resourceId: "*",
          relation: rule.relation,
          subject: commonSubject
        });
      }
    });

    if (payload.length > 0) {
      onSave(payload);
    }
    onClose();
  };

  const isFormValid = selectedSubject && rules.every(r => {
    if (r.scopeType === "global") return !!r.relation;
    if (r.scopeType === "specific") return !!r.relation && !!r.resourceId;
    if (r.scopeType === "script") return !!r.relation && !!r.resourceId && !scriptErrors[r.key];
    return false;
  });

  // Debounced script validation
  const validateScript = React.useCallback((ruleKey: string, script: string) => {
    // Clear existing timeout
    if (scriptValidationTimeouts.current[ruleKey]) {
      clearTimeout(scriptValidationTimeouts.current[ruleKey]);
    }

    if (!script.trim()) {
      setScriptErrors(prev => ({ ...prev, [ruleKey]: null }));
      return;
    }

    scriptValidationTimeouts.current[ruleKey] = setTimeout(async () => {
      setIsValidatingScript(ruleKey);
      try {
        const result = await validatePolicyScript(script);
        setScriptErrors(prev => ({ ...prev, [ruleKey]: result.valid ? null : (result.error ?? "Invalid script") }));
      } catch {
        setScriptErrors(prev => ({ ...prev, [ruleKey]: "Validation failed" }));
      } finally {
        setIsValidatingScript(null);
      }
    }, 500);
  }, []);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={initialPermissions && initialPermissions.length > 0 ? "Edit Permissions" : "Add Permission"}
        size="xl"
        className="max-h-[85vh] flex flex-col"
      >
        <div className="flex-1 overflow-y-auto space-y-8 pr-2">

          {/* SECTION 1: SUBJECT */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-700">
              <Badge variant="info" className="rounded-full w-6 h-6 flex items-center justify-center p-0">1</Badge>
              <h3 className="text-sm font-medium text-white">Subject</h3>
            </div>

            <div className="pl-8 space-y-4">
              {/* Type Switcher (only if not fixed) */}
              {!fixedSubject && (
                <div className="w-fit">
                  <SegmentedControl
                    options={[
                      { value: "User", label: "User" },
                      { value: "Group", label: "Group" },
                      { value: "ApiKey", label: "API Key" },
                    ]}
                    value={subjectType}
                    onChange={(val) => handleSubjectTypeChange(val as "User" | "Group" | "ApiKey")}
                  />
                </div>
              )}

              {/* Subject Picker */}
              {selectedSubject ? (
                <SubjectCard
                  subject={{
                    name: selectedSubject.name || "",
                    type: subjectType,
                    description: selectedSubject.description,
                    avatarUrl: selectedSubject.avatarUrl
                  }}
                  onRemove={!fixedSubject ? () => setSelectedSubject(null) : undefined}
                />
              ) : (
                subjectType === "ApiKey" ? (
                  <Select
                    options={apiKeys.filter(k => k.status === "Active").map(k => ({ value: k.id, label: `${k.owner} (${k.keyId})` }))}
                    onChange={(val) => {
                      const key = apiKeys.find(k => k.id === val);
                      if (key) {
                        setSelectedSubject({
                          id: key.id,
                          name: key.owner,
                          description: key.keyId,
                          type: "ApiKey"
                        });
                      }
                    }}
                    placeholder="Select an API Key..."
                    className="h-10"
                  />
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setIsUserGroupPickerOpen(true)}
                    rightIcon="search"
                    className="w-full justify-between h-10"
                  >
                    Select {subjectType}...
                  </Button>
                )
              )}
            </div>
          </div>

          {/* SECTION 2: RULES */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Badge variant="info" className="rounded-full w-6 h-6 flex items-center justify-center p-0">2</Badge>
                <h3 className="text-sm font-medium text-white">Access Rules</h3>
              </div>
              <Button variant="ghost" size="xs" onClick={handleAddRule} leftIcon="add">Add Rule</Button>
            </div>

            <div className="pl-8 space-y-4">
              {rules.map((rule) => {
                const relations = resourceConfig[rule.resourceType] || [];
                return (
                  <div key={rule.key} className="flex flex-col gap-4 p-4 rounded-lg border border-slate-700 bg-[#111921]/50 relative group">
                    {rules.length > 1 && (
                      <button
                        onClick={() => handleRemoveRule(rule.key)}
                        className="absolute -right-2 -top-2 bg-slate-800 text-slate-400 hover:text-red-400 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md border border-slate-700"
                      >
                        <Icon name="close" size="sm" />
                      </button>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Select
                        label="Resource"
                        value={rule.resourceType}
                        onChange={(val) => updateRule(rule.key, { resourceType: val })}
                        options={availableResourceTypes.map(t => ({ value: t, label: t }))}
                      />
                      <Select
                        label="Permission / Relation"
                        value={rule.relation}
                        onChange={(val) => updateRule(rule.key, { relation: val })}
                        options={relations.map(r => ({ value: r, label: r }))}
                        disabled={!relations.length}
                        placeholder={relations.length ? "Select..." : "No relations defined"}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Scope</label>
                      <Tabs
                        size="sm"
                        tabs={[
                          {
                            label: "Global (All)",
                            content: <div className="text-xs text-gray-500 pt-2 min-h-[120px]">Applies to all {rule.resourceType} resources (*)</div>
                          },
                          {
                            label: "Specific ID(s)",
                            content: (
                              <div className="pt-2 min-h-[120px]">
                                <Input
                                  placeholder={`e.g. ${rule.resourceType}_123, ${rule.resourceType}_456`}
                                  value={rule.scopeType === "specific" ? rule.resourceId : ""}
                                  onChange={(e) => updateRule(rule.key, { resourceId: e.target.value })}
                                  className="font-mono text-xs"
                                />
                              </div>
                            )
                          },
                          {
                            label: "Custom Script (ABAC)",
                            content: (
                              <div className="pt-2 space-y-2 min-h-[120px]">
                                <Textarea
                                  placeholder="return context.resource.amount < 1000"
                                  value={rule.scopeType === "script" ? rule.resourceId : ""}
                                  onChange={(e) => {
                                    updateRule(rule.key, { resourceId: e.target.value });
                                    validateScript(rule.key, e.target.value);
                                  }}
                                  className={`font-mono text-xs h-20 ${scriptErrors[rule.key] ? 'border-red-500' : ''}`}
                                />
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    {isValidatingScript === rule.key && (
                                      <p className="text-[10px] text-gray-500 animate-pulse">Validating...</p>
                                    )}
                                    {scriptErrors[rule.key] && (
                                      <Alert variant="error" className="py-1 px-2 text-[10px]">
                                        {scriptErrors[rule.key]}
                                      </Alert>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] h-6 px-2 ml-2"
                                    onClick={() => setTestModalKey(rule.key)}
                                    disabled={!rule.resourceId.trim() || !!scriptErrors[rule.key]}
                                  >
                                    <Icon name="play_arrow" size="sm" className="mr-1" />
                                    Test
                                  </Button>
                                </div>
                                <p className="text-[10px] text-gray-500">Lua script. Available: <code className="bg-slate-800 px-1 rounded">context.resource</code>, <code className="bg-slate-800 px-1 rounded">context.user</code>. Return <code className="bg-slate-800 px-1 rounded">true</code> to allow.</p>
                              </div>
                            )
                          }
                        ]}
                        defaultIndex={
                          rule.scopeType === "specific" ? 1 : rule.scopeType === "script" ? 2 : 0
                        }
                        onChange={(idx) => {
                          const scopes: ScopeType[] = ["global", "specific", "script"];
                          updateRule(rule.key, { scopeType: scopes[idx], resourceId: "" });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!isFormValid}>
            {initialPermissions && initialPermissions.length > 0 ? "Save Changes" : "Assign Permissions"}
          </Button>
        </ModalFooter>
      </Modal>

      <UserGroupPicker
        isOpen={isUserGroupPickerOpen}
        onClose={() => setIsUserGroupPickerOpen(false)}
        type={subjectType === "Group" ? "group" : "user"}
        onSelect={(item) => {
          setSelectedSubject({
            id: item.id,
            name: item.name,
            description: 'email' in item ? item.email : `${(item as { memberCount?: number }).memberCount || 0} members`,
            avatarUrl: 'image' in item ? item.image || undefined : undefined,
          });
        }}
      />

      {/* Test Script Modal */}
      <TestPolicyModal
        isOpen={!!testModalKey}
        onClose={() => setTestModalKey(null)}
        script={testModalKey ? (rules.find(r => r.key === testModalKey)?.resourceId ?? "") : ""}
      />
    </>
  );
}