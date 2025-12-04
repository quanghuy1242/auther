"use client";

import * as React from "react";
import { Modal, ModalFooter, Button, Input, Select, Alert, Icon } from "@/components/ui";

export interface ApiKey {
  id: string;
  keyId: string;
  owner: string;
  created: string;
  expires: string;
  permissions: string;
  status: "Active" | "Revoked";
}

interface CreateApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: Partial<ApiKey>) => ApiKey;
  onAssignPermissions: (key: ApiKey) => void;
}

export function CreateApiKeyModal({ isOpen, onClose, onSave, onAssignPermissions }: CreateApiKeyModalProps) {
  const [step, setStep] = React.useState<"form" | "result">("form");
  const [name, setName] = React.useState("");
  const [expiry, setExpiry] = React.useState("Never");
  const [generatedKey, setGeneratedKey] = React.useState("");
  const [createdKeyObject, setCreatedKeyObject] = React.useState<ApiKey | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && step === "result") {
      // Reset if re-opening? No, we should probably reset on close.
    } else if (!isOpen) {
      // Reset on close
      setTimeout(() => {
        setStep("form");
        setName("");
        setExpiry("Never");
        setGeneratedKey("");
        setCreatedKeyObject(null);
        setCopied(false);
      }, 300);
    }
  }, [isOpen, step]);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const newKeyString = `sk_live_${Math.random().toString(36).substr(2, 24)}`;
    setGeneratedKey(newKeyString);

    const newKey = onSave({
      owner: name,
      expires: expiry,
      created: new Date().toISOString().split("T")[0],
      status: "Active",
      permissions: "",
      keyId: `key_...${newKeyString.substr(-4)}`
    });

    setCreatedKeyObject(newKey);
    setStep("result");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAssignAndClose = () => {
    if (createdKeyObject) {
      onAssignPermissions(createdKeyObject);
    }
    onClose();
  };

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
          />

          <Alert variant="info">
            Permissions for this key are managed in the Access Control tab. By default, new keys have no access.
          </Alert>

          <ModalFooter>
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!name}>Generate Key</Button>
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
              Save & Assign Permissions
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
