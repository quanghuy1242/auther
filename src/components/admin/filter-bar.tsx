import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function FilterBar({ children, className, ...props }: FilterBarProps) {
  return (
    <div className={cn("flex flex-col gap-4 mb-6", className)} {...props}>
      <div className="flex flex-wrap items-center gap-4 w-full">
        {children}
      </div>
    </div>
  );
}
