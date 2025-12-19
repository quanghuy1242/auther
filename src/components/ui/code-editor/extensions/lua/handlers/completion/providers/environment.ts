import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { CompletionTriggerStatus } from "../types";
import { LuaTypeKind, formatType } from "../../../analysis/type-system";
import { SymbolKind, type Symbol } from "../../../analysis/symbol-table";
import { getDefinitionLoader, type FunctionDefinition } from "../../../definitions/definition-loader";
import type { CompletionItem, CompletionItemKind } from "../../../protocol";

// -----------------------------------------------------------------------------
// ENVIRONMENT PROVIDER (locals, globals, upvalues)
// -----------------------------------------------------------------------------

/**
 * Provides completions for environment (local variables, globals, upvalues)
 * Following EmmyLua's env_provider.rs
 */
export class EnvProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Only for general completion context
        if (builder.triggerStatus !== CompletionTriggerStatus.General) {
            return;
        }

        // Prevent aggressive completion on new lines or empty text
        // (unless triggered manually, but we don't have that info easily, so we rely on word existence)
        const word = builder.getCurrentWord();
        if (!word && !builder.options.isExplicit) {
            return;
        }

        this.addLocalEnv(builder);
        this.addGlobalEnv(builder);
    }

    private addLocalEnv(builder: CompletionBuilder): void {
        // Get visible symbols at offset
        const symbols = builder.analysisResult.symbolTable.getVisibleSymbolsAtOffset(
            builder.offset
        );

        for (const symbol of symbols) {
            // Skip globals (handled separately)
            if (symbol.kind === SymbolKind.Global) continue;

            const item = this.symbolToCompletionItem(symbol);
            builder.addItem(item);
        }
    }

    private addGlobalEnv(builder: CompletionBuilder): void {
        const definitionLoader = getDefinitionLoader();

        // Add sandbox items (data-driven)
        for (const itemName of definitionLoader.getSandboxItemNames()) {
            if (builder.isDuplicate(itemName)) continue;

            const item = definitionLoader.getSandboxItem(itemName);
            if (!item) continue;

            const kind = item.kind === 'function' ? 3 : 6; // Function : Variable
            const detail = (item as FunctionDefinition).signature ?? item.description ?? itemName;

            builder.addItem({
                label: itemName,
                kind,
                detail,
                documentation: item.description,
            });
        }

        // Add builtin globals
        for (const globalName of definitionLoader.getGlobalNames()) {
            if (builder.isDuplicate(globalName)) continue;

            const globalDef = definitionLoader.getGlobal(globalName);
            if (!globalDef) continue;

            builder.addItem({
                label: globalName,
                kind: globalDef.kind === "function" ? 3 : 6,
                detail: (globalDef as FunctionDefinition).signature ?? globalDef.description,
                documentation: globalDef.description,
            });
        }

        // Add builtin libraries
        for (const libName of definitionLoader.getLibraryNames()) {
            if (builder.isDuplicate(libName)) continue;

            builder.addItem({
                label: libName,
                kind: 9, // Module
                detail: `Lua ${libName} library`,
            });
        }
    }

    private symbolToCompletionItem(symbol: Symbol): CompletionItem {
        let kind: CompletionItemKind;

        switch (symbol.kind) {
            case SymbolKind.Local:
                kind = 6; // Variable
                break;
            case SymbolKind.Parameter:
                kind = 6; // Variable
                break;
            case SymbolKind.UpValue:
                kind = 6; // Variable
                break;
            case SymbolKind.Function:
                kind = 3; // Function
                break;
            case SymbolKind.LoopVariable:
                kind = 6; // Variable
                break;
            default:
                kind = 6; // Variable
        }

        const typeStr = formatType(symbol.type);

        // Refine kind based on type (e.g. local function should be Function kind)
        if (symbol.type.kind === LuaTypeKind.Function || symbol.type.kind === LuaTypeKind.FunctionType) {
            kind = 3; // Function
        }

        return {
            label: symbol.name,
            kind,
            detail: `(${symbol.kind}) ${symbol.name}: ${typeStr}`,
            documentation: undefined,
        };
    }
}
