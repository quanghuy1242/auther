import { cn } from "@/lib/utils/cn"

/**
 * Skeleton component for loading states
 * Creates an animated placeholder element
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-800", className)}
      {...props}
    />
  )
}

export interface ContentSkeletonProps {
  lines?: number
  showTitle?: boolean
  maxWidth?: string
  className?: string
}

/**
 * ContentSkeleton component for page loading states
 * Displays a skeleton with title and content lines
 */
function ContentSkeleton({
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
            const widthClass = index === lines - 1 
              ? "w-4/6" 
              : index === lines - 2 
              ? "w-5/6" 
              : ""
            
            return (
              <Skeleton 
                key={index} 
                className={cn("h-4", widthClass)} 
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export { Skeleton, ContentSkeleton }
