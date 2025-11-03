import { cn } from "@/lib/utils/cn";

export interface SkeletonProps {
  className?: string;
}

/**
 * Skeleton component for loading states
 * Creates an animated placeholder element
 * 
 * @example
 * <Skeleton className="h-4 w-full" />
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-slate-800",
        className
      )}
    />
  );
}

export interface ContentSkeletonProps {
  /**
   * Number of lines to show in the skeleton
   * @default 3
   */
  lines?: number;
  /**
   * Show a title skeleton
   * @default true
   */
  showTitle?: boolean;
  /**
   * Maximum width container class
   * @default "max-w-6xl"
   */
  maxWidth?: string;
  /**
   * Additional className for the container
   */
  className?: string;
}

/**
 * ContentSkeleton component for page loading states
 * Displays a skeleton with title and content lines
 * 
 * @example
 * <ContentSkeleton lines={5} showTitle={true} />
 */
export function ContentSkeleton({
  lines = 3,
  showTitle = true,
  maxWidth = "max-w-7xl",
  className,
}: ContentSkeletonProps) {
  return (
    <div className={cn(maxWidth, "mx-auto space-y-6", className)}>
      <div className="space-y-6">
        {showTitle && <Skeleton className="h-8 w-1/3" />}
        <div className="space-y-3">
          {Array.from({ length: lines }).map((_, index) => {
            // Vary the width for a more natural look
            const widthClass = index === lines - 1 
              ? "w-4/6" 
              : index === lines - 2 
              ? "w-5/6" 
              : "";
            
            return (
              <Skeleton 
                key={index} 
                className={cn("h-4", widthClass)} 
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
