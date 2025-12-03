"use client";

import * as React from "react";
import { Input, InputProps } from "@/components/ui/input";

export interface SearchInputProps extends Omit<InputProps, "onChange"> {
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  delay?: number;
}

export function SearchInput({
  value: controlledValue,
  defaultValue,
  onChange,
  onSearch,
  delay = 300,
  className,
  placeholder = "Search...",
  ...props
}: SearchInputProps) {
  const [internalValue, setInternalValue] = React.useState<string>(
    (controlledValue || defaultValue || "").toString()
  );
  
  // Track first render to avoid triggering onSearch on mount
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue);
    }
  }, [controlledValue]);

  React.useEffect(() => {
    if (!onSearch) return;

    // Skip the initial run to prevent infinite loops when used with navigation
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      onSearch(internalValue);
    }, delay);

    return () => clearTimeout(timer);
  }, [internalValue, delay, onSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    onChange?.(newValue);
  };

  return (
    <Input
      type="text"
      leftIcon="search"
      placeholder={placeholder}
      value={internalValue}
      onChange={handleChange}
      className={className}
      {...props}
    />
  );
}
