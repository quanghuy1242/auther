"use client";

import * as React from "react";
import { Tab as HeadlessTab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
  icon?: string; // Material Symbols icon name
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
 * Styled to match the admin clients tab design
 * 
 * @example
 * <Tabs
 *   tabs={[
 *     { label: 'Profile', content: <ProfileTab />, icon: 'person' },
 *     { label: 'Sessions', content: <SessionsTab />, icon: 'schedule' },
 *     { label: 'Activity', content: <ActivityTab />, icon: 'monitoring' },
 *   ]}
 * />
 */
export function Tabs({ tabs, defaultIndex = 0, onChange, className }: TabsProps) {
  return (
    <TabGroup defaultIndex={defaultIndex} onChange={onChange}>
      <div className={cn("border-b border-slate-800 mb-6 overflow-auto", className)}>
        <TabList className="flex gap-1">
          {tabs.map((tab, index) => (
            <HeadlessTab
              key={index}
              disabled={tab.disabled}
              className={({ selected }) =>
                cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative rounded-t-lg",
                  "hover:text-white hover:bg-slate-800/50",
                  "focus:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  selected
                    ? "text-white bg-slate-800/70"
                    : "text-[#93adc8]"
                )
              }
            >
              {({ selected }) => (
                <>
                  {tab.icon && (
                    <span className="material-symbols-outlined text-lg">
                      {tab.icon}
                    </span>
                  )}
                  {tab.label}
                  {selected && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                  )}
                </>
              )}
            </HeadlessTab>
          ))}
        </TabList>
      </div>
      <TabPanels>
        {tabs.map((tab, index) => (
          <TabPanel
            key={index}
            className={cn(
              "focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            )}
          >
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
