import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Secrets page.
 */
export default function SecretsLoading() {
    return (
        <div className="space-y-4">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-10 w-28" />
            </div>

            {/* Table skeleton */}
            <div className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="bg-slate-800 px-4 py-3 border-b border-slate-700">
                    <div className="flex gap-4">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                {[1, 2, 3].map((i) => (
                    <div key={i} className="px-4 py-3 border-b border-slate-700 last:border-0">
                        <div className="flex gap-4">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
