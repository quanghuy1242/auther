"use client";

import * as React from "react";
import {
  Modal,
  ModalFooter,
  Button,
  Input,
  Select,
  Alert,
  Icon,
  SegmentedControl,
  Checkbox,
} from "@/components/ui";
import { type ApiKeyResult } from "@/app/admin/clients/[id]/access/actions";

export interface ApiKey {
  id: string;
  keyId: string;
  owner: string;
  created: string;
  expires: string;
  permissions: string;
  accessMode?: "scoped" | "full_access";
  status: "Active" | "Revoked";
}


interface CreateApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: { name: string; expiresInDays?: number; permissions?: Record<string, string[]>; accessMode?: "scoped" | "full_access" }) => Promise<ApiKeyResult>;
  onAssignPermissions: (key: ApiKey) => void;
  clientId: string;
  resourceConfig: Record<string, string[]>;
}

export function CreateApiKeyModal({ isOpen, onClose, onSave, onAssignPermissions, resourceConfig }: CreateApiKeyModalProps) {
  const [step, setStep] = React.useState<"form" | "result">("form");
  const [name, setName] = React.useState("");
  const [expiry, setExpiry] = React.useState("Never");
  const [accessMode, setAccessMode] = React.useState<"scoped" | "full_access">("scoped");
  const [fullAccessConfirmed, setFullAccessConfirmed] = React.useState(false);
  const [selectedPermissions, setSelectedPermissions] = React.useState<Record<string, string[]>>({});
  const [generatedKey, setGeneratedKey] = React.useState("");
  const [createdKeyObject, setCreatedKeyObject] = React.useState<ApiKey | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (isOpen && step === "result") {
      // Reset if re-opening? No, we should probably reset on close.
    } else if (!isOpen) {
      // Reset on close
      setTimeout(() => {
        setStep("form");
        setName("");
        setExpiry("Never");
        setAccessMode("scoped");
        setFullAccessConfirmed(false);
        setSelectedPermissions({});
        setGeneratedKey("");
        setCreatedKeyObject(null);
        setCopied(false);
        setError("");
        setIsLoading(false);
      }, 300);
    }
  }, [isOpen, step]);

  const hasScopedPermissions = React.useMemo(
    () => Object.values(selectedPermissions).some((relations) => relations.length > 0),
    [selectedPermissions]
  );

  const togglePermission = (resource: string, relation: string, checked: boolean) => {
    setSelectedPermissions((prev) => {
      const existing = prev[resource] ?? [];
      const nextRelations = checked
        ? Array.from(new Set([...existing, relation]))
        : existing.filter((item) => item !== relation);

      const next = {
        ...prev,
        [resource]: nextRelations,
      };

      if (nextRelations.length === 0) {
        delete next[resource];
      }

      return next;
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Map expiry to days
      let days = undefined;
      if (expiry === "30 Days") days = 30;
      if (expiry === "90 Days") days = 90;
      if (expiry === "1 Year") days = 365;

      if (accessMode === "scoped" && !hasScopedPermissions) {
        setError("Select at least one scoped permission.");
        setIsLoading(false);
        return;
      }

      if (accessMode === "full_access" && !fullAccessConfirmed) {
        setError("Confirm full client access before creating the key.");
        setIsLoading(false);
        return;
      }

      const result = await onSave({
        name,
        expiresInDays: days,
        accessMode,
        permissions: accessMode === "scoped" ? selectedPermissions : undefined,
      });

      if (!result.success || !result.apiKey) {
        setError(result.error || "Failed to generate key");
        setIsLoading(false);
        return;
      }

      const newKey = result.apiKey;

      setGeneratedKey(newKey.key); // The raw key string

      setCreatedKeyObject({
        id: newKey.id,
        keyId: newKey.id.substring(0, 8) + "...", // truncated ID for display
        owner: newKey.name,
        created: new Date().toISOString().split("T")[0],
        expires: newKey.expiresAt ? newKey.expiresAt.toISOString().split("T")[0] : "Never",
        permissions: "", // Initial perms are empty
        accessMode,
        status: "Active"
      });

      setStep("result");
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAssignAndClose = () => {
    if (createdKeyObject) {
      if (createdKeyObject.accessMode === "scoped") {
        onAssignPermissions(createdKeyObject);
      }
    }
    onClose();
  };

  const scopedResources = Object.entries(resourceConfig);
  const canGenerate =
    !!name &&
    !isLoading &&
    (accessMode === "full_access" ? fullAccessConfirmed : hasScopedPermissions);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === "form" ? "Generate API Key" : "API Key Generated"}
      size="md"
    >
      {step === "form" ? (
        <form onSubmit={handleGenerate} className="space-y-6">
          <Input
            label="Description / Owner"
            placeholder="e.g. CI/CD Runner"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            disabled={isLoading}
          />

          <Select
            label="Expiration"
            value={expiry}
            onChange={setExpiry}
            options={[
              { value: "30 Days", label: "30 Days" },
              { value: "90 Days", label: "90 Days" },
              { value: "1 Year", label: "1 Year" },
              { value: "Never", label: "Never expire" },
            ]}
            disabled={isLoading}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-white">Access Mode</p>
            <SegmentedControl
              value={accessMode}
              onChange={(value) => {
                setAccessMode(value);
                setError("");
                if (value !== "full_access") {
                  setFullAccessConfirmed(false);
                }
              }}
              options={[
                { label: "Fine-grained access", value: "scoped" },
                { label: "Full client access", value: "full_access" },
              ]}
              disabled={isLoading}
              size="md"
            />
          </div>

          {accessMode === "full_access" ? (
            <div className="space-y-3">
              <Alert variant="warning" title="High-Privilege Access">
                Full client access grants this API key permission to perform any operation on any resource type within this client. This is intended for service accounts and automation. Use scoped permissions for least-privilege access.
              </Alert>
              <Checkbox
                checked={fullAccessConfirmed}
                onChange={setFullAccessConfirmed}
                disabled={isLoading}
                label="I understand this key will have full access to all resources in this client"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-white">Scoped Permissions</p>
              {scopedResources.length === 0 ? (
                <Alert variant="warning" title="No Resources Available">
                  No scoped resources are configured for this client yet.
                </Alert>
              ) : (
                <div className="max-h-60 overflow-auto rounded-lg border border-slate-700 bg-[#111921] p-3 space-y-3">
                  {scopedResources.map(([resource, relations]) => (
                    <div key={resource} className="space-y-2">
                      <p className="text-sm font-medium text-white">{resource}</p>
                      <div className="flex flex-wrap gap-3">
                        {relations.map((relation) => (
                          <Checkbox
                            key={`${resource}:${relation}`}
                            checked={(selectedPermissions[resource] ?? []).includes(relation)}
                            onChange={(checked) => togglePermission(resource, relation, checked)}
                            disabled={isLoading}
                            label={relation}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Alert variant="info">
            {accessMode === "scoped"
              ? "Select at least one scoped permission for this key."
              : "This key will bypass scoped checks for all resources in this client."}
          </Alert>

          {error && <Alert variant="error">{error}</Alert>}

          <ModalFooter>
            <Button variant="ghost" type="button" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!canGenerate}>
              {isLoading ? "Generating..." : "Generate Key"}
            </Button>
          </ModalFooter>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
              <Icon name="check" size="lg" />
            </div>
            <h3 className="text-white font-medium">Key created successfully</h3>
            <p className="text-sm text-gray-400">Please copy this key immediately. You won&apos;t be able to see it again!</p>
          </div>

          <div className="relative group">
            <div className="w-full rounded-lg border border-slate-700 bg-[#111921] p-4 text-white font-mono text-sm break-all pr-12">
              {generatedKey}
            </div>
            <button
              onClick={handleCopy}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
              title="Copy to clipboard"
            >
              <Icon name={copied ? "check" : "content_copy"} size="sm" className={copied ? "text-green-500" : ""} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <Button variant="primary" onClick={handleAssignAndClose} className="w-full">
              {createdKeyObject?.accessMode === "full_access" ? "Save & Close" : "Save & Assign Permissions"}
            </Button>
            <Button variant="secondary" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
