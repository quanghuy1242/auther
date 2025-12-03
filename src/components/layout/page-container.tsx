import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | "full";
}

const maxWidthClasses = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  "2xl": "max-w-screen-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "max-w-full",
};

export function PageContainer({
  children,
  className,
  maxWidth = "6xl",
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 sm:px-6", maxWidthClasses[maxWidth], className)}
      {...props}
    >
      {children}
    </div>
  );
}
