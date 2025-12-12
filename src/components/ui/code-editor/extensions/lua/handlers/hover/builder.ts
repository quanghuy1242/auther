import type { Range, Hover } from "../../protocol";
import { MarkupKind } from "../../protocol";
import type { LuaDocument } from "../../core/document";
import type { AnalysisResult } from "../../analysis/analyzer";

// =============================================================================
// HOVER BUILDER
// =============================================================================

/**
 * Builder for constructing hover responses
 * Following EmmyLua's HoverBuilder pattern
 */
export class HoverBuilder {
    private typeDescription: string | null = null;
    private locationPath: string | null = null;
    private description: string | null = null;
    private paramDescriptions: Map<string, string> = new Map();
    private returnDescription: string | null = null;
    private range: Range | null = null;

    constructor(
        readonly document: LuaDocument,
        readonly analysisResult: AnalysisResult
    ) { }

    /**
     * Set the type description (e.g., "local x: number")
     */
    setTypeDescription(desc: string): this {
        this.typeDescription = desc;
        return this;
    }

    /**
     * Set the location path (e.g., "helpers.fetch")
     */
    setLocationPath(path: string): this {
        this.locationPath = path;
        return this;
    }

    /**
     * Set the main description/documentation
     */
    setDescription(desc: string): this {
        this.description = desc;
        return this;
    }

    /**
     * Add a parameter description
     */
    addParamDescription(name: string, desc: string): this {
        this.paramDescriptions.set(name, desc);
        return this;
    }

    /**
     * Set the return value description
     */
    setReturnDescription(desc: string): this {
        this.returnDescription = desc;
        return this;
    }

    /**
     * Set the range for the hover
     */
    setRange(range: Range): void {
        this.range = range;
    }

    /**
     * Build the final Hover object
     */
    build(): Hover | null {
        const parts: string[] = [];

        // 1. Type Description (Code Block)
        if (this.typeDescription) {
            parts.push("```lua\n" + this.typeDescription + "\n```");
        }

        // 2. Main Description
        if (this.description) {
            parts.push(this.description);
        }

        // 3. Parameters
        if (this.paramDescriptions.size > 0) {
            const paramDocs: string[] = [];
            for (const [name, desc] of this.paramDescriptions) {
                // Determine if it's already formatted or needs formatting
                paramDocs.push(`@* param * \`${name}\` — ${desc}`);
            }
            if (paramDocs.length > 0) {
                parts.push(paramDocs.join("\n\n"));
            }
        }

        // 4. Return Value
        if (this.returnDescription) {
            parts.push(`@*return* — ${this.returnDescription}`);
        }

        if (parts.length === 0) return null;

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: parts.join("\n\n"),
            },
            range: this.range ?? undefined,
        };
    }
}
