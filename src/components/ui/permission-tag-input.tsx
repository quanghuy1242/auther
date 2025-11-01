"use client";

import * as React from "react";
import { Icon, Label } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

export interface PermissionTagInputProps {
  availablePermissions: Array<{ value: string; label: string }>;
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Permission Tag Input component for multi-select with removable tags
 * Displays selected permissions as pills and allows adding from dropdown
 * 
 * @example
 * <PermissionTagInput
 *   availablePermissions={[
 *     { value: 'projects:read', label: 'projects:read' },
 *     { value: 'logs:read', label: 'logs:read' }
 *   ]}
 *   selectedPermissions={['logs:read']}
 *   onChange={setPermissions}
 *   label="Default API key permissions"
 * />
 */
export function PermissionTagInput({
  availablePermissions,
  selectedPermissions,
  onChange,
  label,
  placeholder = "Select permissions...",
  className,
  disabled = false,
}: PermissionTagInputProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleTogglePermission = (value: string) => {
    if (selectedPermissions.includes(value)) {
      onChange(selectedPermissions.filter((p) => p !== value));
    } else {
      onChange([...selectedPermissions, value]);
    }
    setIsOpen(false);
  };

  const handleRemove = (value: string) => {
    onChange(selectedPermissions.filter((p) => p !== value));
  };

  const availableToAdd = availablePermissions.filter(
    (p) => !selectedPermissions.includes(p.value)
  );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label className="text-sm font-medium text-[#93adc8]">
          {label}
        </Label>
      )}

      <div className="relative" ref={dropdownRef}>
        {/* Dropdown trigger */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            "flex items-center justify-between w-full rounded-lg border border-slate-700 bg-[#111921] px-3 py-2 text-white transition-colors",
            "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-slate-600"
          )}
        >
          <span className="text-sm text-gray-400">{placeholder}</span>
          <Icon name="arrow_drop_down" className="text-lg text-gray-400" />
        </button>

        {/* Dropdown menu */}
        {isOpen && availableToAdd.length > 0 && (
          <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-slate-700 bg-sidebar shadow-lg">
            {availableToAdd.map((permission) => (
              <button
                key={permission.value}
                type="button"
                onClick={() => handleTogglePermission(permission.value)}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[#243647] transition-colors font-mono"
              >
                {permission.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected permission tags */}
      {selectedPermissions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedPermissions.map((value) => {
            const perm = availablePermissions.find((p) => p.value === value);
            return (
              <div
                key={value}
                className="flex items-center gap-1.5 rounded-full bg-[#243647] py-1 pl-3 pr-1.5 text-sm text-white"
              >
                <span className="font-mono">{perm?.label || value}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(value)}
                  disabled={disabled}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full bg-slate-600 text-slate-300 hover:bg-slate-500 transition-colors",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                  title="Remove permission"
                >
                  <Icon name="close" className="text-[12px]!" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
