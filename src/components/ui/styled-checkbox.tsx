"use client";

import * as React from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

export interface StyledCheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

/**
 * Styled checkbox component with custom dark theme design
 * Replaces default browser checkbox with a more polished UI
 * 
 * @example
 * <StyledCheckbox
 *   checked={isEnabled}
 *   onChange={setIsEnabled}
 *   label="authorization_code"
 * />
 */
export function StyledCheckbox({
  checked,
  onChange,
  label,
  disabled,
  readOnly,
  className,
}: StyledCheckboxProps) {
  const handleClick = () => {
    if (!disabled && !readOnly && onChange) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === " " || e.key === "Enter") && !disabled && !readOnly && onChange) {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <label
      className={cn(
        "flex items-center gap-3 text-sm text-white select-none",
        !disabled && !readOnly && "cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed",
        readOnly && "cursor-default",
        className
      )}
    >
      <div
        role="checkbox"
        aria-checked={checked}
        aria-disabled={disabled}
        aria-readonly={readOnly}
        tabIndex={disabled || readOnly ? -1 : 0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative flex items-center justify-center w-5 h-5 rounded border-2 transition-all",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-[#111921]",
          checked
            ? "bg-primary border-primary"
            : "bg-[#243647] border-slate-600 hover:border-slate-500",
          disabled && "cursor-not-allowed",
          !disabled && !readOnly && !checked && "hover:bg-[#2a3f52]"
        )}
      >
        {checked && (
          <Icon
            name="check"
            className="text-white !text-[14px] font-bold"
          />
        )}
      </div>
      {label && <span>{label}</span>}
    </label>
  );
}
