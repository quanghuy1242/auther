"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { cn } from "@/lib/utils/cn"
import { Label } from "./label"
import { Icon } from "./icon"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  options: SelectOption[]
  value?: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  error?: string
  required?: boolean
  disabled?: boolean
  className?: string
  name?: string
}

/**
 * Select dropdown component using Radix UI Select
 * Provides accessible keyboard navigation and screen reader support
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
  triggerClassName,
}: SelectProps & { triggerClassName?: string }) {
  const EMPTY_VALUE_SENTINEL = "__EMPTY__"
  const internalValue = value === "" ? EMPTY_VALUE_SENTINEL : value

  return (
    <div className={cn("rounded-md", label && "space-y-1", className)}>
      {label && <Label required={required}>{label}</Label>}
      <SelectPrimitive.Root
        value={internalValue}
        onValueChange={(val) => onChange(val === EMPTY_VALUE_SENTINEL ? "" : val)}
        disabled={disabled}
        name={name}
      >
        <SelectPrimitive.Trigger
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm placeholder:text-gray-500",
            "bg-input text-white",
            "focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors",
            error ? "border-red-500" : "border-gray-700",
            triggerClassName
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <Icon name="expand_more" size="sm" className="text-gray-400 opacity-50" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={cn(
              "relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-gray-700 bg-sidebar text-gray-200 shadow-md animate-in fade-in-80",
              "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1"
            )}
            position="popper"
            sideOffset={4}
          >
            <SelectPrimitive.Viewport className="p-1 max-h-[var(--radix-select-content-available-height)] w-full min-w-[var(--radix-select-trigger-width)]">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value === "" ? EMPTY_VALUE_SENTINEL : option.value}
                  disabled={option.disabled}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-primary focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer"
                  )}
                >
                  <span className="absolute left-2 flex h-4 w-4 items-center justify-center top-1/2 -translate-y-1/2">
                    <SelectPrimitive.ItemIndicator className="flex items-center justify-center w-full h-full">
                      <Icon name="check" size="sm" className="h-4 w-4 leading-none" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
