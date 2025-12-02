"use client";

import * as React from "react";
import { Icon, Input, Button } from "@/components/ui";

export interface PermissionRow {
  resource: string;
  actions: string;
}

export interface PermissionRowBuilderProps {
  permissions: PermissionRow[];
  onChange: (permissions: PermissionRow[]) => void;
  resourcePlaceholder?: string;
  actionsPlaceholder?: string;
  label?: string;
  description?: string;
  minRows?: number;
  className?: string;
}

/**
 * Permission Row Builder component for managing resource-action pairs
 * Similar to UrlListBuilder but for key-value permission definitions
 * 
 * @example
 * <PermissionRowBuilder
 *   permissions={[{ resource: 'projects', actions: 'read, write' }]}
 *   onChange={setPermissions}
 *   label="Custom Resource Permissions"
 *   minRows={0}
 * />
 */
export function PermissionRowBuilder({
  permissions,
  onChange,
  resourcePlaceholder = "Resource (e.g., projects)",
  actionsPlaceholder = "Actions (e.g., read, write)",
  label,
  description,
  minRows = 0,
  className,
}: PermissionRowBuilderProps) {
  const handleUpdate = (index: number, field: "resource" | "actions", value: string) => {
    const updated = [...permissions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    if (permissions.length <= minRows) {
      return; // Prevent removing if at minimum
    }
    onChange(permissions.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...permissions, { resource: "", actions: "" }]);
  };

  return (
    <div className={className}>
      {label && (
        <h3 className="text-white text-base font-bold leading-tight tracking-[-0.015em] mb-2">
          {label}
        </h3>
      )}
      
      {description && (
        <p className="text-sm text-[#93adc8] mb-4">{description}</p>
      )}

      <div className="flex flex-col gap-3">
        {/* Existing permission rows */}
        {permissions.map((permission, index) => (
          <div key={index} className="flex items-center gap-2 w-full">
            <Input
              value={permission.resource}
              onChange={(e) => handleUpdate(index, "resource", e.target.value)}
              placeholder={resourcePlaceholder}
              className="flex-1 bg-input border-slate-700 text-white placeholder-gray-500 focus:border-primary focus:ring-primary text-sm font-mono"
            />
            <Input
              value={permission.actions}
              onChange={(e) => handleUpdate(index, "actions", e.target.value)}
              placeholder={actionsPlaceholder}
              className="flex-1 bg-input border-slate-700 text-white placeholder-gray-500 focus:border-primary focus:ring-primary text-sm font-mono"
            />
          <button
            type="button"
            onClick={onRemove}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-hover-primary hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
          >
              <Icon name="delete" className="text-xl!" />
            </button>
          </div>
        ))}

        {/* Add new permission button */}
        <Button
          type="button"
          variant="secondary"
          onClick={handleAdd}
          leftIcon="add"
          className="w-fit mt-2"
          size="sm"
        >
          Add Permission
        </Button>
      </div>
    </div>
  );
}
