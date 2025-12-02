"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/utils/cn"
import { Icon } from "./icon"

export interface DropdownItem {
  label?: string
  icon?: string
  href?: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

export interface DropdownProps {
  trigger: React.ReactNode
  items: DropdownItem[]
  align?: "start" | "end" | "center"
  className?: string
}

/**
 * Dropdown menu component using Radix UI Dropdown Menu
 * Provides accessible dropdown with keyboard navigation
 */
export function Dropdown({ trigger, items, align = "end", className }: DropdownProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        {trigger}
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          className={cn(
            "z-50 w-56 overflow-hidden rounded-lg border border-[#243647] bg-[#1a2632] p-1 shadow-md animate-in data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            className
          )}
        >
          {items.map((item, index) => {
            if (item.separator) {
              return <DropdownMenuPrimitive.Separator key={index} className="-mx-1 my-1 h-px bg-gray-700" />
            }

            const content = (
              <>
                {item.icon && (
                  <Icon
                    name={item.icon}
                    size="sm"
                    className={cn("mr-2", item.danger ? "text-red-400" : "text-gray-400")}
                  />
                )}
                <span className="flex-1">{item.label}</span>
              </>
            )

            const itemClasses = cn(
              "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-[#243647] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
              item.danger ? "text-red-400 focus:text-red-300" : "text-gray-200 focus:text-white"
            )

            if (item.href) {
              return (
                <DropdownMenuPrimitive.Item
                  key={index}
                  disabled={item.disabled}
                  className={itemClasses}
                  asChild
                >
                  <a href={item.href}>{content}</a>
                </DropdownMenuPrimitive.Item>
              )
            }

            return (
              <DropdownMenuPrimitive.Item
                key={index}
                disabled={item.disabled}
                className={itemClasses}
                onClick={item.onClick}
              >
                {content}
              </DropdownMenuPrimitive.Item>
            )
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
