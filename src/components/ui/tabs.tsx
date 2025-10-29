"use client";

import * as React from "react";
import { Tab as HeadlessTab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
}

/**
 * Tabs component using Headless UI Tab
 * Provides accessible tab navigation with keyboard support
 * 
 * @example
 * <Tabs
 *   tabs={[
 *     { label: 'Profile', content: <ProfileTab /> },
 *     { label: 'Sessions', content: <SessionsTab /> },
 *     { label: 'Activity', content: <ActivityTab /> },
 *   ]}
 * />
 */
export function Tabs({ tabs, defaultIndex = 0, onChange, className }: TabsProps) {
  return (
    <TabGroup defaultIndex={defaultIndex} onChange={onChange}>
      <TabList
        className={cn(
          "flex border-b border-gray-700",
          className
        )}
      >
        {tabs.map((tab, index) => (
          <HeadlessTab
            key={index}
            disabled={tab.disabled}
            className={({ selected }) =>
              cn(
                "px-4 py-3 text-sm font-medium transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-[#1773cf] focus:ring-offset-2 focus:ring-offset-gray-900",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "text-white border-b-2 border-[#1773cf] -mb-[1px]"
                  : "text-gray-400 hover:text-gray-200 hover:border-b-2 hover:border-gray-600 -mb-[1px]"
              )
            }
          >
            {tab.label}
          </HeadlessTab>
        ))}
      </TabList>
      <TabPanels className="mt-4">
        {tabs.map((tab, index) => (
          <TabPanel
            key={index}
            className={cn(
              "focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[#1773cf] focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            )}
          >
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
