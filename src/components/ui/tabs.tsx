"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils/cn"

export interface TabItem {
  label: string
  content: React.ReactNode
  disabled?: boolean
  icon?: string // Material Symbols icon name
}

export interface TabsProps {
  tabs: TabItem[]
  defaultIndex?: number
  selectedIndex?: number
  onChange?: (index: number) => void
  className?: string
  size?: "default" | "sm"
}

/**
 * Tabs component using Radix UI Tabs
 * Provides accessible tab navigation with keyboard support
 */
export function Tabs({ tabs, defaultIndex = 0, selectedIndex, onChange, className, size = "default" }: TabsProps) {
  // Internal state for uncontrolled mode
  const [internalIndex, setInternalIndex] = React.useState(defaultIndex)

  // Use controlled index if provided, otherwise use internal state
  const isControlled = selectedIndex !== undefined
  const currentIndex = isControlled ? selectedIndex : internalIndex

  const handleValueChange = (value: string) => {
    const index = parseInt(value.replace("tab-", ""), 10)
    if (!isControlled) {
      setInternalIndex(index)
    }
    onChange?.(index)
  }

  const sizeClasses = {
    default: "px-4 py-3 text-sm",
    sm: "px-3 py-1.5 text-xs",
  }

  return (
    <TabsPrimitive.Root
      defaultValue={`tab-${defaultIndex}`}
      value={`tab-${currentIndex}`}
      onValueChange={handleValueChange}
      className={className}
    >
      <div className={cn("border-b border-slate-800 overflow-auto", size === "sm" ? "mb-3" : "mb-6")}>
        <TabsPrimitive.List className="flex gap-1">
          {tabs.map((tab, index) => (
            <TabsPrimitive.Trigger
              key={index}
              value={`tab-${index}`}
              disabled={tab.disabled}
              className={cn(
                "flex items-center gap-2 font-medium transition-colors relative rounded-t-lg group",
                sizeClasses[size],
                "hover:text-white hover:bg-slate-800/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "data-[state=active]:text-white data-[state=active]:bg-slate-800/70",
                "data-[state=inactive]:text-[#93adc8]"
              )}
            >
              {tab.icon && (
                <span className={cn("material-symbols-outlined", size === "sm" ? "text-base" : "text-lg")}>
                  {tab.icon}
                </span>
              )}
              {tab.label}
              {/* Active Indicator */}
              <span
                className={cn(
                  "absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 transition-opacity duration-200",
                  "opacity-0 group-data-[state=active]:opacity-100"
                )}
              />
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </div>
      {tabs.map((tab, index) => (
        <TabsPrimitive.Content
          key={index}
          value={`tab-${index}`}
          className={cn(
            "focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          )}
        >
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  )
}
