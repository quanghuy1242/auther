"use client";

import * as React from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";

export interface DropdownItem {
  label?: string;
  icon?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  className?: string;
}

/**
 * Dropdown menu component using Headless UI Menu
 * Provides accessible dropdown with keyboard navigation
 * 
 * @example
 * <Dropdown
 *   trigger={<Button>Options</Button>}
 *   items={[
 *     { label: 'Edit', icon: 'edit', onClick: handleEdit },
 *     { label: 'Delete', icon: 'delete', onClick: handleDelete, danger: true },
 *   ]}
 * />
 */
export function Dropdown({ trigger, items, align = "right", className }: DropdownProps) {
  return (
    <Menu as="div" className={cn("relative inline-block text-left", className)}>
      <MenuButton as={React.Fragment}>
        {trigger}
      </MenuButton>

      <MenuItems
        className={cn(
          "absolute z-10 mt-2 w-56 origin-top-right rounded-lg",
          "bg-[#1a2632] border border-[#243647]",
          "shadow-lg ring-1 ring-black ring-opacity-5",
          "focus:outline-none",
          "divide-y divide-gray-700",
          align === "left" ? "left-0" : "right-0"
        )}
      >
        <div className="py-1">
          {items.map((item, index) => {
            if (item.separator) {
              return <div key={index} className="my-1 border-t border-gray-700" />;
            }

            const content = (
              <>
                {item.icon && (
                  <Icon 
                    name={item.icon} 
                    size="sm" 
                    className={cn(
                      item.danger ? "text-red-400" : "text-gray-400"
                    )} 
                  />
                )}
                <span className="flex-1">{item.label}</span>
              </>
            );

            if (item.href) {
              return (
                <MenuItem key={index} disabled={item.disabled}>
                  {({ focus }) => (
                    <a
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        focus && "bg-[#243647]",
                        item.danger
                          ? "text-red-400 hover:text-red-300"
                          : "text-gray-200 hover:text-white",
                        item.disabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {content}
                    </a>
                  )}
                </MenuItem>
              );
            }

            return (
              <MenuItem key={index} disabled={item.disabled}>
                {({ focus }) => (
                  <button
                    onClick={item.onClick}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-sm text-left transition-colors",
                      focus && "bg-[#243647]",
                      item.danger
                        ? "text-red-400 hover:text-red-300"
                        : "text-gray-200 hover:text-white",
                      item.disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {content}
                  </button>
                )}
              </MenuItem>
            );
          })}
        </div>
      </MenuItems>
    </Menu>
  );
}
