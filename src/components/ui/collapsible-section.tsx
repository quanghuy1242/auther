"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { Icon } from "./icon"
import { cn } from "@/lib/utils/cn"

export interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
  headerClassName?: string
}

/**
 * Collapsible Section component for expandable content areas
 * Uses Radix UI Collapsible for accessible expand/collapse behavior
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  className,
  headerClassName,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <CollapsiblePrimitive.Root
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#1A2530]/50", className)}
    >
      <CollapsiblePrimitive.Trigger
        className={cn(
          "flex items-center justify-between p-6 cursor-pointer w-full text-left",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1773cf] focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded-t-xl",
          headerClassName
        )}
      >
        <h2 className="text-white text-lg font-bold leading-tight tracking-[-0.015em]">
          {title}
        </h2>
        <span className={cn("text-gray-400 transition-transform duration-200", isOpen && "rotate-180")}>
          <Icon name="expand_more" />
        </span>
      </CollapsiblePrimitive.Trigger>
      
      <CollapsiblePrimitive.Content className="data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up overflow-hidden">
        <div className="px-6 pb-6 flex flex-col gap-6">
          {children}
        </div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}
