import { getScripts, getPipelineConfig } from "../actions";
import { SwimlaneEditor } from "@/components/admin/pipelines/swimlane-editor";

/**
 * Pipeline Editor page.
 * Provides visual editor for configuring authentication flows.
 */
export default async function EditorPage() {
    // Fetch only editor-related data (lazy loaded)
    const [scripts, config] = await Promise.all([
        getScripts(),
        getPipelineConfig(),
    ]);

    return (
        <SwimlaneEditor
            initialScripts={scripts}
            initialConfig={config}
        />
    );
}
