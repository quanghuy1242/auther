"use client"

import * as React from "react"
import { Icon } from "@/components/ui/icon"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface PermissionTagInputProps {
  availablePermissions: Array<{ value: string; label: string }>
  selectedPermissions: string[]
  onChange: (permissions: string[]) => void
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Permission Tag Input component for multi-select with removable tags
 * Displays selected permissions as pills and allows adding from dropdown
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
  const [open, setOpen] = React.useState(false)

  const handleSelect = (value: string) => {
    if (selectedPermissions.includes(value)) {
      onChange(selectedPermissions.filter((p) => p !== value))
    } else {
      onChange([...selectedPermissions, value])
    }
    setOpen(false)
  }

  const handleRemove = (value: string) => {
    onChange(selectedPermissions.filter((p) => p !== value))
  }

  const availableToAdd = availablePermissions.filter(
    (p) => !selectedPermissions.includes(p.value)
  )

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label className="text-sm font-medium text-[#93adc8]">
          {label}
        </Label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex items-center justify-between w-full rounded-lg border border-slate-700 bg-input px-3 py-2 text-white transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-slate-600",
              open && "border-primary ring-1 ring-primary"
            )}
          >
            <span className="text-sm text-gray-400">{placeholder}</span>
            <Icon name="arrow_drop_down" className="text-lg text-gray-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
          <Command>
            <CommandInput placeholder="Search permissions..." />
            <CommandList>
              <CommandEmpty>No permission found.</CommandEmpty>
              <CommandGroup>
                {availablePermissions.map((permission) => {
                  const isSelected = selectedPermissions.includes(permission.value)
                  return (
                    <CommandItem
                      key={permission.value}
                      value={permission.label}
                      onSelect={() => handleSelect(permission.value)}
                      className="flex items-center justify-between"
                    >
                      <span className={cn(isSelected && "text-gray-500")}>
                        {permission.label}
                      </span>
                      {isSelected && <Icon name="check" size="sm" className="text-primary" />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected permission tags */}
      {selectedPermissions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedPermissions.map((value) => {
            const perm = availablePermissions.find((p) => p.value === value)
            return (
              <Badge
                key={value}
                variant="default"
                className="pl-3 pr-1.5 py-1 h-auto bg-[#243647] hover:bg-hover-primary text-white border-0 gap-2"
              >
                <span className="font-mono text-sm">{perm?.label || value}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(value)}
                  disabled={disabled}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full bg-slate-600 text-slate-300 hover:bg-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                  title="Remove permission"
                >
                  <Icon name="close" className="text-[10px] font-bold" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
