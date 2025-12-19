import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";

const DOC_TAGS = [
    "param", "return", "type", "class", "field", "alias", "see", "deprecated",
    "overload", "generic", "vararg", "async", "nodiscard", "cast", "operator",
    "enum", "meta", "module", "source", "version", "diagnostic", "as",
    "private", "protected", "public", "package",
];

export class DocTagProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Check if we're in a doc comment context
        if (!this.isInDocComment(builder)) return;

        const sortedTags = [...DOC_TAGS];
        for (let i = 0; i < sortedTags.length; i++) {
            const tag = sortedTags[i];
            builder.addItem({
                label: tag,
                kind: 24, // Event
                detail: `@${tag}`,
                documentation: this.getTagDocumentation(tag),
                sortText: String(i).padStart(3, "0"),
            });
        }

        builder.stopHere();
    }

    private isInDocComment(builder: CompletionBuilder): boolean {
        const line = builder.document.getLine(builder.position.line);
        const textBefore = line.slice(0, builder.position.character);

        // Check for ---@ pattern
        return /---\s*@?\s*[\w]*$/.test(textBefore);
    }

    private getTagDocumentation(tag: string): string {
        const docs: Record<string, string> = {
            param: "Documents a function parameter: `---@param name type description`",
            return: "Documents return value(s): `---@return type description`",
            type: "Specifies the type of a variable: `---@type Type`",
            class: "Defines a class type: `---@class ClassName`",
            field: "Defines a field in a class: `---@field name type`",
            alias: "Creates a type alias: `---@alias Name Type`",
            see: "References related content: `---@see Other`",
            deprecated: "Marks as deprecated: `---@deprecated Use X instead`",
            overload: "Defines function overload: `---@overload fun(a: string): number`",
            generic: "Defines generic type parameter: `---@generic T`",
            vararg: "Documents vararg parameter: `---@vararg type`",
            async: "Marks function as async: `---@async`",
            nodiscard: "Warns if return value ignored: `---@nodiscard`",
            cast: "Casts expression type: `---@cast var Type`",
            operator: "Defines operator metamethod: `---@operator add(number): number`",
            enum: "Defines enum type: `---@enum Name`",
            diagnostic: "Controls diagnostics: `---@diagnostic disable: warning-name`",
            private: "Marks as private: `---@private`",
            protected: "Marks as protected: `---@protected`",
            public: "Marks as public: `---@public`",
            package: "Marks as package-private: `---@package`",
        };
        return docs[tag] ?? `EmmyLua annotation: @${tag}`;
    }
}
