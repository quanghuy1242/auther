"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils/cn"

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  className?: string
}

/**
 * Switch/Toggle component using Radix UI Switch
 * Provides accessible toggle functionality with smooth animations
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: SwitchProps) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <SwitchPrimitives.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1773cf] focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50 self-center",
          checked ? "bg-[#1773cf]" : "bg-gray-700"
        )}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
          )}
        />
      </SwitchPrimitives.Root>
      {(label || description) && (
        <div className="flex-1 cursor-pointer" onClick={() => !disabled && onChange(!checked)}>
          {label && (
            <div className="text-sm font-medium text-gray-200">
              {label}
            </div>
          )}
          {description && (
            <p className="text-sm text-gray-400">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
