import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Editor page.
 */
export default function EditorLoading() {
    return (
        <div className="space-y-6">
            {/* Swimlane header skeleton */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-32" />
            </div>

            {/* Swimlane content skeleton */}
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-lg border border-slate-700 p-4">
                        <Skeleton className="h-6 w-36 mb-4" />
                        <div className="space-y-2">
                            <Skeleton className="h-20 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
