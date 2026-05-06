"use client";

import * as React from "react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, CopyableField, Input, Modal, Select } from "@/components/ui";
import { toast } from "@/lib/toast";
import type { SpaceServiceAccountSummary } from "@/lib/auth/authorization-space-service-account-service";
import {
  createSpaceServiceAccount,
  revokeSpaceServiceAccount,
  rotateSpaceServiceAccount,
} from "./actions";

type GrantOption = {
  modelId: string;
  entityType: string;
  relation: string;
};

interface ServiceAccountsPanelProps {
  spaceId: string;
  serviceAccounts: SpaceServiceAccountSummary[];
  grantOptions: GrantOption[];
}

export function ServiceAccountsPanel({
  spaceId,
  serviceAccounts,
  grantOptions,
}: ServiceAccountsPanelProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [name, setName] = React.useState("");
  const [accessMode, setAccessMode] = React.useState<"scoped" | "full_access">("scoped");
  const [selectedGrants, setSelectedGrants] = React.useState<Set<string>>(new Set());
  const [expiresInDays, setExpiresInDays] = React.useState("");
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);

  function toggleGrant(value: string, checked: boolean) {
    const next = new Set(selectedGrants);
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    setSelectedGrants(next);
  }

  function resetCreateForm() {
    setName("");
    setAccessMode("scoped");
    setSelectedGrants(new Set());
    setExpiresInDays("");
  }

  function handleCreate() {
    const grants = Array.from(selectedGrants).map((value) => {
      const [modelId, relation] = value.split("|");
      return { modelId, relation };
    });

    startTransition(async () => {
      const result = await createSpaceServiceAccount({
        spaceId,
        name,
        accessMode,
        grants,
        expiresInDays: expiresInDays ? Number(expiresInDays) : null,
      });

      if (!result.success || !result.serviceAccount) {
        toast.error("Failed to create service account", result.error);
        return;
      }

      setCreatedKey(result.serviceAccount.key);
      resetCreateForm();
      toast.success("Service account created");
    });
  }

  function handleRevoke(serviceAccountId: string) {
    startTransition(async () => {
      const result = await revokeSpaceServiceAccount(spaceId, serviceAccountId);
      if (result.success) {
        toast.success("Service account revoked");
      } else {
        toast.error("Failed to revoke service account", result.error);
      }
    });
  }

  function handleRotate(serviceAccountId: string) {
    startTransition(async () => {
      const result = await rotateSpaceServiceAccount(spaceId, serviceAccountId);
      if (result.success && result.serviceAccount) {
        setCreatedKey(result.serviceAccount.key);
        setIsCreateOpen(true);
        toast.success("Service account rotated");
      } else {
        toast.error("Failed to rotate service account", result.error);
      }
    });
  }

  const groupedGrantOptions = grantOptions.reduce<Record<string, GrantOption[]>>((acc, option) => {
    acc[option.entityType] ??= [];
    acc[option.entityType].push(option);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Service Accounts</CardTitle>
          <CardDescription>
            Create and manage API-key service accounts scoped to this authorization space.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon="add"
          onClick={() => {
            setCreatedKey(null);
            setIsCreateOpen(true);
          }}
        >
          New Service Account
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {serviceAccounts.length === 0 ? (
          <div className="rounded-lg border border-border-dark bg-black/10 p-4 text-sm text-gray-400">
            No service accounts exist in this authorization space.
          </div>
        ) : (
          <div className="space-y-2">
            {serviceAccounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-dark bg-black/10 p-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-gray-200">{account.name}</p>
                    <Badge variant={account.accessMode === "full_access" ? "success" : "default"}>
                      {account.accessMode}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-gray-500">{account.id}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {account.grants.length} grant{account.grants.length === 1 ? "" : "s"}
                    {account.expiresAt ? ` · expires ${account.expiresAt.toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleRotate(account.id)}
                  >
                    Rotate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleRevoke(account.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreatedKey(null);
        }}
        title={createdKey ? "Service Account Key" : "New Service Account"}
        description={createdKey ? "Copy this key now. It will not be shown again." : undefined}
      >
        {createdKey ? (
          <CopyableField label="API Key" value={createdKey} />
        ) : (
          <div className="space-y-4">
            <Input
              name="name"
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Payload publisher"
            />
            <Select
              label="Access"
              value={accessMode}
              onChange={(value) => setAccessMode(value as "scoped" | "full_access")}
              options={[
                { value: "scoped", label: "Scoped grants" },
                { value: "full_access", label: "Full space access" },
              ]}
            />
            <Input
              name="expiresInDays"
              label="Expires In Days"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              placeholder="Optional"
              type="number"
              min={1}
              max={3650}
            />
            {accessMode === "scoped" && (
              <div className="space-y-3">
                {Object.entries(groupedGrantOptions).map(([entityType, options]) => (
                  <div key={entityType} className="rounded-lg border border-border-dark bg-black/10 p-3">
                    <p className="font-mono text-sm text-gray-200">{entityType}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {options.map((option) => {
                        const value = `${option.modelId}|${option.relation}`;
                        return (
                          <Checkbox
                            key={value}
                            id={`grant-${value}`}
                            label={option.relation}
                            checked={selectedGrants.has(value)}
                            onChange={(checked) => toggleGrant(value, checked)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                {grantOptions.length === 0 && (
                  <p className="text-sm text-gray-400">No grantable models are available in this space.</p>
                )}
              </div>
            )}
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isPending || !name || (accessMode === "scoped" && selectedGrants.size === 0)}
              onClick={handleCreate}
            >
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        )}
      </Modal>
    </Card>
  );
}
