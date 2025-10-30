"use client";

import * as React from "react";
import { Switch as HeadlessSwitch } from "@headlessui/react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Checkbox/Toggle component using Headless UI Switch
 * Provides accessible toggle functionality with smooth animations
 * 
 * @example
 * <Checkbox
 *   checked={enabled}
 *   onChange={setEnabled}
 *   label="Allow Dynamic Client Registration"
 *   description="Enable automatic registration of OAuth clients"
 * />
 */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: CheckboxProps) {
  return (
    <HeadlessSwitch.Group>
      <div className={cn("flex items-start gap-3", className)}>
        <HeadlessSwitch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full",
            "border-2 border-transparent transition-colors duration-200 ease-in-out",
            "focus:outline-none focus:ring-2 focus:ring-[#1773cf] focus:ring-offset-2 focus:ring-offset-gray-900 self-center",
            checked ? "bg-[#1773cf]" : "bg-gray-700",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg",
              "transform ring-0 transition duration-200 ease-in-out",
              checked ? "translate-x-5" : "translate-x-0"
            )}
          />
        </HeadlessSwitch>
        {(label || description) && (
          <div className="flex-1">
            {label && (
              <HeadlessSwitch.Label className="text-sm font-medium text-gray-200 cursor-pointer">
                {label}
              </HeadlessSwitch.Label>
            )}
            {description && (
              <HeadlessSwitch.Description className="text-sm text-gray-400">
                {description}
              </HeadlessSwitch.Description>
            )}
          </div>
        )}
      </div>
    </HeadlessSwitch.Group>
  );
}
