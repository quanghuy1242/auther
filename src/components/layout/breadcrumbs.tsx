"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { BreadcrumbItem as BreadcrumbItemType } from "@/lib/types"
import { generateBreadcrumbs } from "@/lib/breadcrumbs"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export interface BreadcrumbsProps {
  items?: BreadcrumbItemType[]
}

/**
 * Breadcrumbs navigation component
 * Shows hierarchical navigation path
 * Auto-generates breadcrumbs from pathname if items not provided
 */
export function Breadcrumbs({ items: customItems }: BreadcrumbsProps) {
  const pathname = usePathname()
  const items = customItems || generateBreadcrumbs(pathname)
  
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          
          return (
            <React.Fragment key={index}>
              <BreadcrumbItem>
                {item.href && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>
                    {item.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
