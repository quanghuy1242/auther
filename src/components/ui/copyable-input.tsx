"use client";

import * as React from "react";
import { Icon, Input } from "@/components/ui";
import { useCopyToClipboard } from "@/lib/utils/clipboard";

export interface CopyableInputProps {
  id?: string;
  label?: string;
  value: string;
  type?: "text" | "password";
  readOnly?: boolean; // When true, disables the copy button
  className?: string;
  labelClassName?: string;
}

/**
 * Copyable Input component with integrated copy button
 * Displays a read-only input with a copy-to-clipboard button positioned on the right
 * 
 * @example
 * <CopyableInput
 *   id="clientId"
 *   label="Client ID"
 *   value="client_abc123"
 *   labelClassName="text-sm font-medium text-[#93adc8]"
 * />
 */
export function CopyableInput({
  id,
  label,
  value,
  type = "text",
  readOnly = false,
  className = "w-full bg-input border-slate-700 text-white text-sm pr-10",
  labelClassName = "text-sm font-medium text-gray-400",
}: CopyableInputProps) {
  const { copied, handleCopy } = useCopyToClipboard<string>();

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className={labelClassName} htmlFor={id}>
          {label}
        </label>
      )}
      <div className="relative">
        <Input
          id={id}
          value={value}
          type={type}
          readOnly
          className={className}
        />
        {!readOnly && (
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            onClick={() => handleCopy(value, value)}
            title="Copy to clipboard"
          >
            {copied === value ? (
              <Icon name="check" className="text-lg mt-1" />
            ) : (
              <Icon name="content_copy" className="text-lg mt-1" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
