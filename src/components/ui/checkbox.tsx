"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils/cn"

export interface CheckboxProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  readOnly?: boolean
  className?: string
  id?: string
}

/**
 * Checkbox component using Radix UI
 * Replaces default browser checkbox with a more polished UI
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  readOnly,
  className,
  id,
}: CheckboxProps) {
  return (
    <div className={cn("flex items-center gap-3 text-sm text-white select-none", className)}>
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={(checked) => {
          if (!disabled && !readOnly && onChange) {
            onChange(checked === true)
          }
        }}
        disabled={disabled || readOnly}
        className={cn(
          "relative flex items-center justify-center w-5 h-5 rounded border-2 transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#111921]",
          checked
            ? "bg-primary border-primary"
            : "bg-[#243647] border-slate-600 hover:border-slate-500",
          disabled && "cursor-not-allowed opacity-50",
          readOnly && "cursor-default",
          !disabled && !readOnly && !checked && "hover:bg-[#2a3f52]"
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Icon
            name="check"
            className="text-white !text-[14px] font-bold"
          />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && (
        <label 
          htmlFor={id} 
          className={cn(
            "cursor-pointer",
            (disabled || readOnly) && "cursor-default"
          )}
        >
          {label}
        </label>
      )}
    </div>
  )
}
