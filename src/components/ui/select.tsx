"use client";

import * as React from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { cn } from "@/lib/utils/cn";
import { Label } from "./label";
import { Icon } from "./icon";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
}

/**
 * Select dropdown component using Headless UI Listbox
 * Provides accessible keyboard navigation and screen reader support
 * 
 * @example
 * <Select
 *   label="User Role"
 *   options={[
 *     { value: 'viewer', label: 'Viewer' },
 *     { value: 'editor', label: 'Editor' },
 *     { value: 'admin', label: 'Admin' },
 *   ]}
 *   value={selectedRole}
 *   onChange={setSelectedRole}
 * />
 */
export function Select({
  options,
  value,
  onChange,
  label,
  placeholder = "Select an option",
  error,
  required,
  disabled,
  className,
  name,
}: SelectProps) {
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className={cn("space-y-1 rounded-md", className)}>
      {label && <Label required={required}>{label}</Label>}
      <Listbox value={value} onChange={onChange} disabled={disabled} name={name}>
        {({ open }) => (
          <div className="relative rounded-md">
            <ListboxButton
              className={cn(
                "relative w-full rounded-md border px-3 py-2 text-left text-sm",
                "bg-input text-white",
                "focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "transition-colors",
                error ? "border-red-500" : "border-gray-700"
              )}
            >
              <span className={cn(!selectedOption && "text-gray-500")}>
                {selectedOption?.label || placeholder}
              </span>
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                <Icon
                  name={open ? "expand_less" : "expand_more"}
                  size="sm"
                  className="text-gray-400"
                />
              </span>
            </ListboxButton>
            <ListboxOptions
              className={cn(
                "absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md",
                "bg-sidebar border border-gray-700",
                "py-1 text-sm shadow-lg",
                "focus:outline-none"
              )}
            >
              {options.map((option) => (
                <ListboxOption
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={({ focus, selected }) =>
                    cn(
                      "relative cursor-pointer select-none py-2 pl-3 pr-9",
                      "transition-colors",
                      focus && "bg-primary text-white",
                      !focus && selected && "bg-primary/20 text-white",
                      !focus && !selected && "text-gray-200",
                      option.disabled && "cursor-not-allowed opacity-50"
                    )
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={cn("block truncate", selected && "font-semibold")}>
                        {option.label}
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <Icon name="check" size="sm" className="text-white" />
                        </span>
                      )}
                    </>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        )}
      </Listbox>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
