// =============================================================================
// SEMANTIC ANALYZER
// =============================================================================
// Main semantic analyzer inspired by EmmyLua's SemanticModel and infer system
// See: emmylua-analyzer-rust/crates/emmylua_code_analysis/src/semantic/

import type { LuaDocument } from "../core/document";
import type { Range } from "../protocol";
import type {
    LuaNode,
    LuaChunk,
    LuaStatement,
    LuaExpression,
    LuaIdentifier,
    LuaLocalStatement,
    LuaAssignmentStatement,
    LuaFunctionDeclaration,
    LuaFunctionExpression,
    LuaForNumericStatement,
    LuaForGenericStatement,
    LuaCallExpression,
    LuaMemberExpression,
    LuaIndexExpression,
    LuaTableConstructorExpression,
    LuaBinaryExpression,
    LuaUnaryExpression,
    LuaLogicalExpression,
    LuaReturnStatement,
    LuaIfStatement,
    LuaWhileStatement,
    LuaDoStatement,
    LuaRepeatStatement,
} from "../core/luaparse-types";
import {
    isIdentifier,
    isMemberExpression,
    isCallExpression,
} from "../core/luaparse-types";
import { SymbolTable, SymbolKind, ScopeKind, createSandboxSymbols } from "./symbol-table";
import type { Symbol } from "./symbol-table";
import {
    LuaType,
    LuaTypeKind,
    LuaTypes,
    LuaFunctionType,
    LuaFunctionParam,
    functionType,
    tableType,
    definitionToType,
    globalDefinitionToType,
} from "./type-system";
import { DiagnosticCollector } from "./diagnostics";
import { getDefinitionLoader } from "../definitions/definition-loader";
import type { FieldDefinition } from "../definitions/definition-loader";
import { FlowTree, FlowBinder, FlowId, finishFlowLabel } from "./flow-graph";
// Modular inference functions
import {
    InferContext,
    inferBinaryExpressionType as inferBinaryType,
    inferLogicalExpressionType as inferLogicalType,
    inferUnaryExpressionType as inferUnaryType,
    inferExpressionType as inferExpressionTypeFn,
    inferTableType as inferTableTypeFn,
    inferCallExpressionType as inferCallType,
    inferMemberExpressionType as inferMemberType,
    inferIndexExpressionType as inferIndexType,
} from "./infer";

// =============================================================================
// ANALYZER OPTIONS
// =============================================================================

export interface AnalyzerOptions {
    /** Hook name for context-aware analysis */
    hookName?: string;

    /** Previous script code for prev schema inference */
    previousScriptCode?: string;

    /** Script outputs from other scripts in pipeline */
    scriptOutputs?: Map<string, unknown>;

    /** Maximum script size in bytes */
    maxScriptSize?: number;

    /** Maximum loop nesting depth before warning */
    maxLoopDepth?: number;

    /** Whether to check for unused variables */
    checkUnused?: boolean;

    /** Whether to check for shadowed variables */
    checkShadowing?: boolean;
}

const DEFAULT_OPTIONS: Required<AnalyzerOptions> = {
    hookName: "",
    previousScriptCode: "",
    scriptOutputs: new Map(),
    maxScriptSize: 5120,
    maxLoopDepth: 5,
    checkUnused: true,
    checkShadowing: true,
};

// =============================================================================
// ANALYSIS RESULT
// =============================================================================

export interface AnalysisResult {
    /** Symbol table for the document */
    symbolTable: SymbolTable;

    /** Collected diagnostics */
    diagnostics: DiagnosticCollector;

    /** Inferred types for expressions (keyed by offset) */
    types: Map<number, LuaType>;

    /** Return statements found */
    returns: Array<{ range: Range; type: LuaType }>;

    /** Flow graph for control flow analysis */
    flowTree: FlowTree;

    /** Whether analysis completed successfully */
    success: boolean;
}

// =============================================================================
// SEMANTIC ANALYZER
// =============================================================================

/**
 * Main semantic analyzer for Lua documents
 * Similar to EmmyLua's SemanticModel
 */
export class SemanticAnalyzer {
    private document: LuaDocument;
    private options: Required<AnalyzerOptions>;
    private symbolTable: SymbolTable;
    private diagnostics: DiagnosticCollector;
    private types: Map<number, LuaType>;
    private returns: Array<{ range: Range; type: LuaType }>;
    private loopDepth: number = 0;
    private definitionLoader = getDefinitionLoader();

    // Flow graph building
    private flowBinder: FlowBinder;
    private currentFlowId: FlowId;

    // Track symbol references for unused detection
    private usedSymbols: Set<number> = new Set();

    constructor(document: LuaDocument, options?: AnalyzerOptions) {
        this.document = document;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.symbolTable = new SymbolTable();
        this.diagnostics = new DiagnosticCollector();
        this.types = new Map();
        this.returns = [];

        // Initialize flow graph
        this.flowBinder = new FlowBinder();
        this.currentFlowId = this.flowBinder.start;

        // Register sandbox globals
        this.registerGlobals();
    }

    /**
     * Run the analysis
     */
    analyze(): AnalysisResult {
        // Check script size
        this.checkScriptSize();

        // Parse AST
        const ast = this.document.getAST();
        const parseError = this.document.getParseError();

        // Add syntax error if present
        if (parseError) {
            this.diagnostics.add(
                DiagnosticCollector.createDiagnostics.syntaxError(
                    parseError.range,
                    parseError.message
                )
            );
        }

        if (ast) {
            // First pass: collect declarations
            this.collectDeclarations(ast);

            // Second pass: analyze and infer types
            this.analyzeChunk(ast);

            // Post-analysis: check for unused symbols
            if (this.options.checkUnused) {
                this.checkUnused();
            }
        }

        return {
            symbolTable: this.symbolTable,
            diagnostics: this.diagnostics,
            types: this.types,
            returns: this.returns,
            flowTree: this.flowBinder.finish(),
            success: !this.diagnostics.hasErrors(),
        };
    }

    // ---------------------------------------------------------------------------
    // Global Registration
    // ---------------------------------------------------------------------------

    private registerGlobals(): void {
        const globals = createSandboxSymbols();

        // Enrich types with full definitions
        const helpers = globals.get("helpers");
        if (helpers) {
            helpers.type = this.buildHelpersType();
            const def = this.definitionLoader.getHelpers();
            if (def.description) {
                helpers.documentation = def.description;
            }
        }

        const context = globals.get("context");
        if (context) {
            context.type = this.buildContextType();
            const def = this.definitionLoader.getContext();
            if (def.description) {
                context.documentation = def.description;
            }
        }

        globals.forEach((symbol) => {
            this.symbolTable.addGlobalSymbol(symbol);
        });
    }

    private checkScriptSize(): void {
        const size = this.document.getLength();
        if (size > this.options.maxScriptSize) {
            this.diagnostics.add(
                DiagnosticCollector.createDiagnostics.scriptTooLarge(
                    { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                    size,
                    this.options.maxScriptSize
                )
            );
        }
    }

    // ---------------------------------------------------------------------------
    // Declaration Collection (First Pass)
    // ---------------------------------------------------------------------------

    private collectDeclarations(chunk: LuaChunk): void {
        this.collectFromStatements(chunk.body);
    }

    private collectFromStatements(statements: LuaStatement[]): void {
        for (const stmt of statements) {
            this.collectFromStatement(stmt);
        }
    }

    private collectFromStatement(stmt: LuaStatement): void {
        switch (stmt.type) {
            case "LocalStatement":
                this.collectLocalStatement(stmt as LuaLocalStatement);
                break;

            case "FunctionDeclaration":
                this.collectFunctionDeclaration(stmt as LuaFunctionDeclaration);
                break;

            case "AssignmentStatement":
                this.collectAssignmentStatement(stmt as LuaAssignmentStatement);
                break;

            case "ForNumericStatement":
                this.collectForNumericStatement(stmt as LuaForNumericStatement);
                break;

            case "ForGenericStatement":
                this.collectForGenericStatement(stmt as LuaForGenericStatement);
                break;

            case "IfStatement": {
                const ifStmt = stmt as LuaIfStatement;
                for (const clause of ifStmt.clauses) {
                    if (clause.body) {
                        this.collectFromStatements(clause.body);
                    }
                }
                break;
            }

            case "WhileStatement":
            case "RepeatStatement":
            case "DoStatement": {
                const blockStmt = stmt as LuaWhileStatement | LuaRepeatStatement | LuaDoStatement;
                if (blockStmt.body) {
                    this.collectFromStatements(blockStmt.body);
                }
                break;
            }
        }
    }

    private collectLocalStatement(stmt: LuaLocalStatement): void {
        for (let i = 0; i < stmt.variables.length; i++) {
            const varNode = stmt.variables[i];
            const initExpr = stmt.init[i];

            let type: LuaType = LuaTypes.Unknown;

            // Infer type from initializer if present
            if (initExpr) {
                type = this.inferExpressionType(initExpr);
            }

            this.declareSymbol(varNode, SymbolKind.Local, type);
        }
    }

    private collectFunctionDeclaration(decl: LuaFunctionDeclaration): void {
        // Declare the function
        if (decl.identifier && isIdentifier(decl.identifier)) {
            const fnType = this.buildFunctionType(decl);
            this.declareSymbol(
                decl.identifier,
                decl.isLocal ? SymbolKind.Local : SymbolKind.Global,
                fnType
            );
        }

        // Enter function scope
        const scopeKind = decl.identifier && isMemberExpression(decl.identifier) &&
            (decl.identifier as LuaMemberExpression).indexer === ":"
            ? ScopeKind.Method
            : ScopeKind.Function;

        const range = this.nodeToRange(decl);
        const [start, end] = decl.range ?? [0, 0];
        this.symbolTable.enterScope(scopeKind, range, start, end);

        // Declare parameters
        for (let i = 0; i < decl.parameters.length; i++) {
            const param = decl.parameters[i];
            if (isIdentifier(param)) {
                this.declareSymbol(param, SymbolKind.Parameter, LuaTypes.Unknown);
            }
        }

        // Process body
        this.collectFromStatements(decl.body);

        this.symbolTable.exitScope();
    }

    private collectAssignmentStatement(stmt: LuaAssignmentStatement): void {
        for (let i = 0; i < stmt.variables.length; i++) {
            const varExpr = stmt.variables[i];
            const initExpr = stmt.init[i];

            // Only handle simple identifier assignments (global declarations)
            if (isIdentifier(varExpr)) {
                const existing = this.symbolTable.lookupSymbol(varExpr.name);
                if (!existing) {
                    // New global
                    let type: LuaType = LuaTypes.Unknown;
                    if (initExpr) {
                        type = this.inferExpressionType(initExpr);
                    }
                    this.declareSymbol(varExpr, SymbolKind.Global, type);
                }
            }
        }
    }

    private collectForNumericStatement(stmt: LuaForNumericStatement): void {
        const range = this.nodeToRange(stmt);
        const [start, end] = stmt.range ?? [0, 0];
        this.symbolTable.enterScope(ScopeKind.For, range, start, end);

        // Declare loop variable
        this.declareSymbol(stmt.variable, SymbolKind.LoopVariable, LuaTypes.Number);

        this.collectFromStatements(stmt.body);

        this.symbolTable.exitScope();
    }

    private collectForGenericStatement(stmt: LuaForGenericStatement): void {
        const range = this.nodeToRange(stmt);
        const [start, end] = stmt.range ?? [0, 0];
        this.symbolTable.enterScope(ScopeKind.ForIn, range, start, end);

        // Declare loop variables
        for (const varNode of stmt.variables) {
            this.declareSymbol(varNode, SymbolKind.LoopVariable, LuaTypes.Unknown);
        }

        this.collectFromStatements(stmt.body);

        this.symbolTable.exitScope();
    }

    // ---------------------------------------------------------------------------
    // Analysis (Second Pass)
    // ---------------------------------------------------------------------------

    private analyzeChunk(chunk: LuaChunk): void {
        this.analyzeStatements(chunk.body);
    }

    private analyzeStatements(statements: LuaStatement[]): void {
        for (const stmt of statements) {
            this.analyzeStatement(stmt);
        }
    }

    private analyzeStatement(stmt: LuaStatement): void {
        switch (stmt.type) {
            case "LocalStatement":
                this.analyzeLocalStatement(stmt as LuaLocalStatement);
                break;

            case "AssignmentStatement":
                this.analyzeAssignmentStatement(stmt as LuaAssignmentStatement);
                break;

            case "CallStatement":
                this.analyzeCallStatement(stmt as { expression: LuaExpression });
                break;

            case "ReturnStatement":
                this.analyzeReturnStatement(stmt as LuaReturnStatement);
                break;

            case "IfStatement":
                this.analyzeIfStatement(stmt as LuaIfStatement);
                break;

            case "WhileStatement":
                this.analyzeWhileStatement(stmt as LuaWhileStatement);
                break;

            case "RepeatStatement":
                this.analyzeRepeatStatement(stmt as LuaRepeatStatement);
                break;

            case "DoStatement":
                this.analyzeDoStatement(stmt as LuaDoStatement);
                break;

            case "ForNumericStatement":
                this.analyzeForNumericStatement(stmt as LuaForNumericStatement);
                break;

            case "ForGenericStatement":
                this.analyzeForGenericStatement(stmt as LuaForGenericStatement);
                break;

            case "FunctionDeclaration":
                this.analyzeFunctionDeclaration(stmt as LuaFunctionDeclaration);
                break;
        }
    }

    private analyzeLocalStatement(stmt: LuaLocalStatement): void {
        for (const initExpr of stmt.init) {
            this.analyzeExpression(initExpr);
        }
    }

    private analyzeAssignmentStatement(stmt: LuaAssignmentStatement): void {
        // Analyze left-hand side
        for (const varExpr of stmt.variables) {
            this.analyzeExpression(varExpr as LuaExpression);
        }

        // Analyze right-hand side
        for (const initExpr of stmt.init) {
            this.analyzeExpression(initExpr);
        }
    }

    private analyzeReturnStatement(stmt: LuaReturnStatement): void {
        const types: LuaType[] = [];

        for (const arg of stmt.arguments) {
            const type = this.analyzeExpression(arg);
            types.push(type);
        }

        const returnType = types.length === 0
            ? LuaTypes.Void
            : types.length === 1
                ? types[0]
                : { kind: LuaTypeKind.Tuple, elements: types } as LuaType;

        this.returns.push({
            range: this.nodeToRange(stmt),
            type: returnType,
        });

        // Create Return flow node - marks code after as unreachable within branch
        const returnFlowId = this.flowBinder.createReturn();
        this.flowBinder.addAntecedent(returnFlowId, this.currentFlowId);
        this.currentFlowId = this.flowBinder.unreachable;
    }

    private analyzeIfStatement(stmt: LuaIfStatement): void {
        const postIfLabel = this.flowBinder.createBranchLabel();
        let currentFlow = this.currentFlowId;

        for (let i = 0; i < stmt.clauses.length; i++) {
            const clause = stmt.clauses[i];

            if (clause.condition) {
                // Analyze condition expression
                this.analyzeExpression(clause.condition);

                // Create TrueCondition for then-branch
                const thenLabel = this.flowBinder.createBranchLabel();
                const elseLabel = this.flowBinder.createBranchLabel();

                // Create TrueCondition node (binds condition to truthy path)
                const trueCondition = this.flowBinder.createTrueCondition(clause.condition);
                this.flowBinder.addAntecedent(trueCondition, currentFlow);
                this.flowBinder.addAntecedent(thenLabel, trueCondition);

                // Bind the condition expression offset to the true condition flow
                if (clause.condition.range) {
                    this.flowBinder.bindOffset(clause.condition.range[0], trueCondition);
                }

                // Create FalseCondition node (binds condition to falsy path)
                const falseCondition = this.flowBinder.createFalseCondition(clause.condition);
                this.flowBinder.addAntecedent(falseCondition, currentFlow);
                this.flowBinder.addAntecedent(elseLabel, falseCondition);

                // Analyze then-body with truthy flow
                const savedFlow = this.currentFlowId;
                this.currentFlowId = finishFlowLabel(this.flowBinder, thenLabel, currentFlow);

                if (clause.body) {
                    this.analyzeStatements(clause.body);
                }

                // Connect to post-if if not unreachable
                if (!this.flowBinder.isUnreachable(this.currentFlowId)) {
                    this.flowBinder.addAntecedent(postIfLabel, this.currentFlowId);
                }

                // Move to else branch for next iteration
                currentFlow = finishFlowLabel(this.flowBinder, elseLabel, savedFlow);
            } else {
                // This is an else clause (no condition)
                this.currentFlowId = currentFlow;

                if (clause.body) {
                    this.analyzeStatements(clause.body);
                }

                // Connect to post-if
                if (!this.flowBinder.isUnreachable(this.currentFlowId)) {
                    this.flowBinder.addAntecedent(postIfLabel, this.currentFlowId);
                }
            }
        }

        // If no else clause, the else path flows to post-if
        const lastClause = stmt.clauses[stmt.clauses.length - 1];
        if (lastClause?.condition) {
            // No else clause - add fallthrough
            this.flowBinder.addAntecedent(postIfLabel, currentFlow);
        }

        // Continue with merged flow after if
        this.currentFlowId = finishFlowLabel(this.flowBinder, postIfLabel, currentFlow);
    }

    private analyzeWhileStatement(stmt: LuaWhileStatement): void {
        this.analyzeExpression(stmt.condition);
        this.loopDepth++;
        this.checkLoopDepth(stmt);
        this.analyzeStatements(stmt.body);
        this.loopDepth--;
    }

    private analyzeRepeatStatement(stmt: LuaRepeatStatement): void {
        this.loopDepth++;
        this.checkLoopDepth(stmt);
        this.analyzeStatements(stmt.body);
        this.analyzeExpression(stmt.condition);
        this.loopDepth--;
    }

    private analyzeDoStatement(stmt: LuaDoStatement): void {
        this.analyzeStatements(stmt.body);
    }

    /**
     * Analyze call statements with special handling for assert() and error()
     * Port of EmmyLua's assert/error narrowing from infer_call/
     */
    private analyzeCallStatement(stmt: { expression: LuaExpression }): void {
        const expr = stmt.expression;
        this.analyzeExpression(expr);

        // Check for assert() and error() calls
        if (expr.type === 'CallExpression') {
            const callExpr = expr as LuaCallExpression;
            const base = callExpr.base;

            // Check if it's an assert() call
            if (base?.type === 'Identifier' && (base as LuaIdentifier).name === 'assert') {
                // assert(x) means x is truthy after this point
                // Create a TrueCondition flow node for the first argument
                const args = callExpr.arguments;
                if (Array.isArray(args) && args.length > 0) {
                    const firstArg = args[0];
                    // Create a TrueCondition node - after assert(x), x is truthy
                    const conditionFlowId = this.flowBinder.createTrueCondition(firstArg);
                    this.currentFlowId = conditionFlowId;
                }
            }

            // Check if it's an error() call
            if (base?.type === 'Identifier' && (base as LuaIdentifier).name === 'error') {
                // error() never returns - mark as unreachable
                this.currentFlowId = this.flowBinder.unreachable;
            }
        }
    }

    private analyzeForNumericStatement(stmt: LuaForNumericStatement): void {
        this.analyzeExpression(stmt.start);
        this.analyzeExpression(stmt.end);
        if (stmt.step) {
            this.analyzeExpression(stmt.step);
        }
        this.loopDepth++;
        this.checkLoopDepth(stmt);
        this.analyzeStatements(stmt.body);
        this.loopDepth--;
    }

    private analyzeForGenericStatement(stmt: LuaForGenericStatement): void {
        for (const iter of stmt.iterators) {
            this.analyzeExpression(iter);
        }
        this.loopDepth++;
        this.checkLoopDepth(stmt);
        this.analyzeStatements(stmt.body);
        this.loopDepth--;
    }

    private analyzeFunctionDeclaration(decl: LuaFunctionDeclaration): void {
        // Analyze function body
        this.analyzeStatements(decl.body);
    }

    private checkLoopDepth(stmt: LuaNode): void {
        if (this.loopDepth > this.options.maxLoopDepth) {
            this.diagnostics.add(
                DiagnosticCollector.createDiagnostics.deeplyNestedLoop(
                    this.nodeToRange(stmt),
                    this.loopDepth
                )
            );
        }
    }

    // ---------------------------------------------------------------------------
    // Expression Analysis
    // ---------------------------------------------------------------------------

    private analyzeExpression(expr: LuaExpression): LuaType {
        const type = this.inferExpressionType(expr);

        // Store inferred type
        if (expr.range) {
            this.types.set(expr.range[0], type);

            // Bind identifier expressions to current flow ID for type narrowing
            if (isIdentifier(expr)) {
                this.flowBinder.bindOffset(expr.range[0], this.currentFlowId);
            }
        }

        // Check for specific issues
        this.checkExpressionIssues(expr, type);

        return type;
    }

    private checkExpressionIssues(expr: LuaExpression, _type: LuaType): void {
        // Check for undefined variables
        if (isIdentifier(expr)) {
            this.checkIdentifier(expr);
        }

        // Check for disabled globals
        if (isIdentifier(expr)) {
            const name = (expr as LuaIdentifier).name;
            if (this.definitionLoader.isDisabled(name)) {
                const message = this.definitionLoader.getDisabledMessage(name);
                this.diagnostics.add(
                    DiagnosticCollector.createDiagnostics.disabledGlobal(
                        this.nodeToRange(expr),
                        name,
                        message
                    )
                );
            }
        }

        // Check async without await
        if (isCallExpression(expr)) {
            this.checkAsyncCall(expr as LuaCallExpression);
        }
    }

    private checkIdentifier(ident: LuaIdentifier): void {
        const name = ident.name;

        // Skip special names
        if (name === "self" || name === "_") return;

        // Check if defined
        const symbol = this.symbolTable.lookupSymbol(name, ident.range?.[0]);

        if (!symbol) {
            // Check if it's a builtin or sandbox global
            if (
                this.definitionLoader.getGlobal(name) ||
                this.definitionLoader.getLibrary(name) ||
                createSandboxSymbols().has(name)
            ) {
                return; // It's a known global
            }

            this.diagnostics.add(
                DiagnosticCollector.createDiagnostics.undefinedVariable(
                    this.nodeToRange(ident),
                    name
                )
            );
        } else {
            // Mark as used
            this.usedSymbols.add(symbol.id);
        }
    }

    private checkAsyncCall(call: LuaCallExpression): void {
        // Check if calling an async function without await
        if (isMemberExpression(call.base)) {
            const memberExpr = call.base as LuaMemberExpression;
            if (
                isIdentifier(memberExpr.base) &&
                (memberExpr.base as LuaIdentifier).name === "helpers"
            ) {
                const methodName = memberExpr.identifier.name;
                const helperDef = this.definitionLoader.getHelper(methodName);
                if (helperDef?.async) {
                    // Check if wrapped in await
                    // This would require parent context - simplified check here
                    // Full implementation would track await wrapping
                }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Type Inference
    // ---------------------------------------------------------------------------

    /**
     * Analyze an expression by delegating to the modular infer system
     */
    private inferExpressionType(expr: LuaExpression): LuaType {
        // Create context for the inference module
        const context: InferContext = {
            lookupSymbolType: (name, offset) => {
                const symbol = this.symbolTable.lookupSymbol(name, offset);
                // Side effect: track reference
                if (symbol && offset) {
                    this.symbolTable.addReference(symbol.id, offset);
                    return symbol.type;
                }
                return null;
            },
            inferType: (e) => this.inferExpressionType(e),
            getDefinitionLoader: () => this.definitionLoader,
            hookName: this.options.hookName,
            definitionToType: (def) => this.definitionToType(def as FieldDefinition),
            globalDefinitionToType: (def) => this.globalDefinitionToType(def),
            buildHelpersType: () => this.buildHelpersType(),
            buildContextType: () => this.buildContextType()
        };

        return inferExpressionTypeFn(expr, context);
    }

    private inferIdentifierType(ident: LuaIdentifier): LuaType {
        const name = ident.name;

        // Check local symbol table
        const symbol = this.symbolTable.lookupSymbol(name, ident.range?.[0]);
        if (symbol) {
            if (ident.range) {
                this.symbolTable.addReference(symbol.id, ident.range[0]);
            }
            return symbol.type;
        }

        // Check definitions
        const globalDef = this.definitionLoader.getGlobal(name);
        if (globalDef) {
            return this.globalDefinitionToType(globalDef);
        }

        const libDef = this.definitionLoader.getLibrary(name);
        if (libDef) {
            return this.definitionToType(libDef);
        }

        // Check sandbox
        if (name === "helpers") {
            return this.buildHelpersType();
        }
        if (name === "context") {
            return this.buildContextType();
        }
        if (name === "await") {
            return LuaTypes.Function;
        }

        return LuaTypes.Unknown;
    }

    /**
     * Infer member expression type - delegates to infer-member.ts
     */
    private inferMemberExpressionType(expr: LuaMemberExpression): LuaType {
        return inferMemberType(
            expr,
            (e: LuaExpression) => this.analyzeExpression(e),
            () => this.definitionLoader,
            this.options.hookName,
            (def: unknown) => this.definitionToType(def as FieldDefinition)
        );
    }

    /**
     * Infer index expression type - delegates to infer-member.ts
     */
    private inferIndexExpressionType(expr: LuaIndexExpression): LuaType {
        return inferIndexType(
            expr,
            (e: LuaExpression) => this.analyzeExpression(e),
            () => this.definitionLoader
        );
    }

    /**
     * Infer call expression type - delegates to infer-call.ts
     */
    private inferCallExpressionType(call: LuaCallExpression): LuaType {
        return inferCallType(
            call,
            (e: LuaExpression) => this.analyzeExpression(e),
            () => this.definitionLoader
        );
    }

    /**
     * Infer table type - delegates to infer-table.ts
     */
    private inferTableType(expr: LuaTableConstructorExpression): LuaType {
        return inferTableTypeFn(expr, (e: LuaExpression) => this.analyzeExpression(e));
    }

    /**
     * Infer binary expression type - delegates to infer-binary.ts
     */
    private inferBinaryExpressionType(expr: LuaBinaryExpression): LuaType {
        return inferBinaryType(expr, (e: LuaExpression) => this.analyzeExpression(e));
    }

    /**
     * Infer unary expression type - delegates to infer-binary.ts
     */
    private inferUnaryExpressionType(expr: LuaUnaryExpression): LuaType {
        return inferUnaryType(expr, (e: LuaExpression) => this.analyzeExpression(e));
    }

    /**
     * Infer logical expression type - delegates to infer-binary.ts
     */
    private inferLogicalExpressionType(expr: LuaLogicalExpression): LuaType {
        return inferLogicalType(expr, (e: LuaExpression) => this.analyzeExpression(e));
    }

    // ---------------------------------------------------------------------------
    // Type Building Helpers
    // ---------------------------------------------------------------------------

    private buildFunctionType(
        decl: LuaFunctionDeclaration | LuaFunctionExpression
    ): LuaFunctionType {
        const params: LuaFunctionParam[] = [];

        for (const param of decl.parameters) {
            if (isIdentifier(param)) {
                params.push({
                    name: (param as LuaIdentifier).name,
                    type: LuaTypes.Unknown,
                });
            } else {
                // Vararg
                params.push({
                    name: "...",
                    type: LuaTypes.Any,
                    vararg: true,
                });
            }
        }

        return functionType(params, [LuaTypes.Unknown]);
    }

    private buildHelpersType(): LuaType {
        const helpersDef = this.definitionLoader.getHelpers();
        return this.definitionToType(helpersDef);
    }

    private buildContextType(): LuaType {
        const contextFields = this.definitionLoader.getContextFieldsForHook(
            this.options.hookName
        );

        const fields: Array<{ name: string; type: LuaType; optional?: boolean }> = [];
        for (const [name, def] of Object.entries(contextFields)) {
            fields.push({
                name,
                type: this.definitionToType(def),
                optional: def.kind === "property" && def.optional,
            });
        }

        return tableType(fields);
    }

    /**
     * Convert a field definition to LuaType
     * Delegates to centralized function in type-system.ts
     */
    private definitionToType(def: FieldDefinition | undefined): LuaType {
        return definitionToType(def as unknown as Parameters<typeof definitionToType>[0]);
    }

    /**
     * Convert a global definition to LuaType
     * Delegates to centralized function in type-system.ts
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private globalDefinitionToType(def: any): LuaType {
        return globalDefinitionToType(def);
    }

    // ---------------------------------------------------------------------------
    // Unused Detection
    // ---------------------------------------------------------------------------

    private checkUnused(): void {
        for (const symbol of this.symbolTable.getAllSymbols()) {
            // Skip parameters starting with _ or globals
            if (symbol.name.startsWith("_")) continue;
            if (symbol.kind === SymbolKind.Global) continue;

            if (!this.usedSymbols.has(symbol.id)) {
                if (symbol.kind === SymbolKind.Parameter) {
                    this.diagnostics.add(
                        DiagnosticCollector.createDiagnostics.unusedParameter(
                            symbol.range,
                            symbol.name
                        )
                    );
                } else if (symbol.kind === SymbolKind.Local) {
                    this.diagnostics.add(
                        DiagnosticCollector.createDiagnostics.unusedVariable(
                            symbol.range,
                            symbol.name
                        )
                    );
                }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Utilities
    // ---------------------------------------------------------------------------

    private declareSymbol(
        node: LuaIdentifier,
        kind: SymbolKind,
        type: LuaType
    ): Symbol {
        const range = this.nodeToRange(node);
        const offset = node.range?.[0] ?? 0;

        // Check for shadowing
        if (this.options.checkShadowing && kind === SymbolKind.Local) {
            const existing = this.symbolTable.lookupSymbol(node.name);
            if (existing && existing.kind !== SymbolKind.Global) {
                this.diagnostics.add(
                    DiagnosticCollector.createDiagnostics.shadowedVariable(
                        range,
                        node.name,
                        existing.range
                    )
                );
            }
        }

        return this.symbolTable.declareSymbol(node.name, kind, type, range, offset);
    }

    private nodeToRange(node: LuaNode): Range {
        if (node.loc) {
            return this.document.locToRange(node.loc);
        }
        if (node.range) {
            return this.document.offsetRangeToRange(node.range[0], node.range[1]);
        }
        return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Analyze a document and return results
 */
export function analyzeDocument(
    document: LuaDocument,
    options?: AnalyzerOptions
): AnalysisResult {
    const analyzer = new SemanticAnalyzer(document, options);
    return analyzer.analyze();
}
