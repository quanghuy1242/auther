import { getTraces, getTraceTriggerEvents } from "../actions";
import { TraceList } from "@/components/admin/pipelines/trace-viewer";

/**
 * Traces page.
 * Displays pipeline execution traces with waterfall visualization.
 */
export default async function TracesPage() {
    // Fetch initial data (lazy loaded)
    const [traces, triggerEvents] = await Promise.all([
        getTraces(),
        getTraceTriggerEvents(),
    ]);

    return (
        <TraceList
            initialTraces={traces}
            triggerEvents={triggerEvents}
        />
    );
}
