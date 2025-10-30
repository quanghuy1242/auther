"use client";

import * as React from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils/cn";

export interface CopyableFieldProps {
  label: string;
  value: string;
  copyable?: boolean;
  className?: string;
}

/**
 * Copyable field component with label, value, and optional copy button
 * Shows "Copied!" feedback when copy button is clicked
 * 
 * @example
 * <CopyableField 
 *   label="API Key" 
 *   value="sk_live_123456789" 
 *   copyable 
 * />
 */
export function CopyableField({ 
  label, 
  value, 
  copyable = true,
  className 
}: CopyableFieldProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className={cn("flex justify-between items-start py-4 border-b border-white/10", className)}>
      <div className="flex flex-col gap-1 flex-1 min-w-0 pr-2">
        <p className="text-[#93adc8] text-sm font-normal leading-normal">{label}</p>
        <p className="text-white text-sm font-normal leading-normal break-all overflow-wrap-anywhere">{value}</p>
      </div>
      {copyable && (
        <button
          onClick={handleCopy}
          className="p-2 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors flex-shrink-0 mt-0.5"
          title="Copy to clipboard"
        >
          {copied ? (
            <Icon name="check" className="!text-xl text-green-400" />
          ) : (
            <Icon name="content_copy" className="!text-xl" />
          )}
        </button>
      )}
    </div>
  );
}
