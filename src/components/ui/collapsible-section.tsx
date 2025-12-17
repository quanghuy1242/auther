"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { Icon } from "./icon"
import { cn } from "@/lib/utils/cn"

export interface CollapsibleSectionProps {
  title: React.ReactNode
  icon?: string
  description?: string
  actions?: React.ReactNode
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
  icon,
  description,
  actions,
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
      className={cn("flex flex-col rounded-xl border border-[#243647] bg-[#1a2632]", className)}
    >
      <div className={cn("flex items-start justify-between p-6", headerClassName)}>
        <CollapsiblePrimitive.Trigger className="flex flex-1 items-center gap-4 text-left cursor-pointer focus:outline-none group">
          <div className="flex-1">
            <h2 className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex items-center gap-2">
              {icon && <Icon name={icon} size="sm" className="h-5 w-5 text-gray-400 group-hover:text-white transition-colors" />}
              {title}
            </h2>
            {description && (
              <p className="text-sm text-gray-400 mt-1">{description}</p>
            )}
          </div>
          <Icon 
            name="expand_more" 
            className={cn(
              "text-gray-400 transition-transform duration-200 shrink-0", 
              isOpen && "rotate-180"
            )} 
          />
        </CollapsiblePrimitive.Trigger>
        {actions && (
          <div className="pl-4 flex items-center">
            {actions}
          </div>
        )}
      </div>
      
      <CollapsiblePrimitive.Content className="data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up overflow-hidden">
        <div className="px-6 pb-6 pt-0 flex flex-col gap-6">
          {children}
        </div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}