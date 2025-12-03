"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils/cn"

export interface NavTab {
  label: string
  href: string
  icon?: string // Material Symbols icon name
}

export interface NavTabsProps {
  tabs: NavTab[]
  className?: string
}

/**
 * Navigation tabs component for route-based navigation
 * Uses Next.js Link for client-side navigation with active state detection
 * Styled to match the Radix Tabs component
 */
export function NavTabs({ tabs, className }: NavTabsProps) {
  const pathname = usePathname()

  return (
    <div className={cn("border-b border-slate-800 mb-6", className)}>
      <nav className="flex gap-1" aria-label="Navigation tabs">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href
          
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={true}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative rounded-t-lg",
                "hover:text-white hover:bg-slate-800/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
                isActive
                  ? "text-white bg-slate-800/70"
                  : "text-[#93adc8]"
              )}
            >
              {tab.icon && (
                <span className="material-symbols-outlined text-lg">
                  {tab.icon}
                </span>
              )}
              {tab.label}
              {isActive && (
                <span 
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                  aria-hidden="true" 
                />
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
