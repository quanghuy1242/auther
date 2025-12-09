import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Traces page.
 */
export default function TracesLoading() {
    return (
        <div className="space-y-4">
            {/* Filters skeleton */}
            <div className="flex gap-4">
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-48" />
            </div>

            {/* Table skeleton */}
            <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="bg-slate-800 px-4 py-3 border-b border-slate-700">
                    <div className="flex gap-4">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="px-4 py-3 border-b border-slate-700 last:border-0">
                        <div className="flex gap-4">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
