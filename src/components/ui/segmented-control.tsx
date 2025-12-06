"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"

export interface SegmentedControlOption<T extends string> {
  label: string
  value: T
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  size?: "sm" | "md"
}

/**
 * SegmentedControl component
 * A linear set of two or more segments, each of which functions as a mutually exclusive button.
 * 
 * @example
 * <SegmentedControl
 *   value={mode}
 *   onChange={setMode}
 *   options={[
 *     { label: "Visual", value: "visual" },
 *     { label: "Code", value: "json" }
 *   ]}
 * />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  className,
  size = "sm"
}: SegmentedControlProps<T>) {

  const sizeClasses = {
    sm: "py-1.5 px-3 text-xs",
    md: "py-2 px-4 text-sm"
  }

  return (
    <div className={cn("flex bg-[#111921] rounded-lg p-1 border border-slate-700", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(option.value)}
          className={cn(
            "flex-1 font-medium rounded transition-all whitespace-nowrap",
            sizeClasses[size],
            value === option.value
              ? "bg-[#243647] text-white shadow-sm"
              : "text-gray-400 hover:text-white",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
