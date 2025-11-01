"use client";

import * as React from "react";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils/cn";

export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

/**
 * Collapsible Section component for expandable content areas
 * Uses Headless UI Disclosure for accessible expand/collapse behavior
 * 
 * @example
 * <CollapsibleSection title="API Key Management" defaultOpen>
 *   <p>Content here...</p>
 * </CollapsibleSection>
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  className,
  headerClassName,
}: CollapsibleSectionProps) {
  return (
    <Disclosure as="div" className={cn("flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#1A2530]/50", className)} defaultOpen={defaultOpen}>
      {({ open }) => (
        <>
          <DisclosureButton className={cn("flex items-center justify-between p-6 cursor-pointer w-full text-left", headerClassName)}>
            <h2 className="text-white text-lg font-bold leading-tight tracking-[-0.015em]">
              {title}
            </h2>
            <span className={cn("text-gray-400 transition-transform", open && "rotate-180")}>
              <Icon name="expand_more" />
            </span>
          </DisclosureButton>
          
          <DisclosurePanel className="px-6 pb-6 flex flex-col gap-6">
            {children}
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}
