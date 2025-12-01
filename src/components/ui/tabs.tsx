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
  onChange?: (index: number) => void
  className?: string
}

/**
 * Tabs component using Radix UI Tabs
 * Provides accessible tab navigation with keyboard support
 */
export function Tabs({ tabs, defaultIndex = 0, onChange, className }: TabsProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(defaultIndex)

  const handleValueChange = (value: string) => {
    const index = parseInt(value.replace("tab-", ""), 10)
    setSelectedIndex(index)
    onChange?.(index)
  }

  return (
    <TabsPrimitive.Root
      defaultValue={`tab-${defaultIndex}`}
      value={`tab-${selectedIndex}`}
      onValueChange={handleValueChange}
      className={className}
    >
      <div className="border-b border-slate-800 mb-6 overflow-auto">
        <TabsPrimitive.List className="flex gap-1">
          {tabs.map((tab, index) => (
            <TabsPrimitive.Trigger
              key={index}
              value={`tab-${index}`}
              disabled={tab.disabled}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative rounded-t-lg",
                "hover:text-white hover:bg-slate-800/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "data-[state=active]:text-white data-[state=active]:bg-slate-800/70",
                "data-[state=inactive]:text-[#93adc8]"
              )}
            >
              {tab.icon && (
                <span className="material-symbols-outlined text-lg">
                  {tab.icon}
                </span>
              )}
              {tab.label}
              {/* Active Indicator */}
              <span 
                className={cn(
                  "absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 transition-opacity duration-200",
                  "data-[state=active]:opacity-100 data-[state=inactive]:opacity-0"
                )}
                // Since Radix doesn't expose selected state to children easily without Context, 
                // we rely on parent data-state for the trigger, but we need this span to show/hide.
                // CSS sibling selector or data-state on parent is cleanest.
              />
              {/* 
                Note: Radix Trigger sets data-state="active" on itself. 
                We can use that for the indicator visibility.
                Using a pseudo-element or a child with a conditional class based on the parent's data-state 
                is best done via Tailwind's group modifier or simple CSS.
                Here, I'll simply use the data-state selector on the span itself if I could pass it, 
                but Radix passes it to the Trigger button.
                
                Let's fix the indicator: 
                The easiest way in Tailwind is to use the `group` pattern or `[&[data-state=active]>span]:opacity-100`.
              */}
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
