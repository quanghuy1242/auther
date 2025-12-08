// Type declarations for luaparse
// Based on https://github.com/fstirlitz/luaparse

declare module "luaparse" {
    export interface ParseOptions {
        /** Wait for parser before returning */
        wait?: boolean;
        /** Write comments during parse */
        comments?: boolean;
        /** What scope to use */
        scope?: boolean;
        /** Include locations in nodes */
        locations?: boolean;
        /** Include ranges in nodes */
        ranges?: boolean;
        /** Only return statements */
        onCreateNode?: (node: Node) => void;
        /** Only emit scope */
        onCreateScope?: () => void;
        /** Destroy scopes */
        onDestroyScope?: () => void;
        /** Called when local statement is found */
        onLocalDeclaration?: (identifier: Identifier) => void;
        /** Lua version to parse */
        luaVersion?: "5.1" | "5.2" | "5.3" | "5.4" | "LuaJIT";
        /** Features to enable */
        extendedIdentifiers?: boolean;
        /** Allow binary */
        encodingMode?: "none" | "pseudo-latin1" | "x-user-defined";
    }

    export interface Location {
        start: { line: number; column: number };
        end: { line: number; column: number };
    }

    export interface BaseNode {
        type: string;
        range?: [number, number];
        loc?: Location;
    }

    export interface Identifier extends BaseNode {
        type: "Identifier";
        name: string;
        isLocal?: boolean;
    }

    export interface StringLiteral extends BaseNode {
        type: "StringLiteral";
        value: string;
        raw: string;
    }

    export interface NumericLiteral extends BaseNode {
        type: "NumericLiteral";
        value: number;
        raw: string;
    }

    export interface BooleanLiteral extends BaseNode {
        type: "BooleanLiteral";
        value: boolean;
        raw: string;
    }

    export interface NilLiteral extends BaseNode {
        type: "NilLiteral";
        value: null;
        raw: string;
    }

    export interface VarargLiteral extends BaseNode {
        type: "VarargLiteral";
        value: string;
        raw: string;
    }

    export interface TableKey extends BaseNode {
        type: "TableKey";
        key: Expression;
        value: Expression;
    }

    export interface TableKeyString extends BaseNode {
        type: "TableKeyString";
        key: Identifier;
        value: Expression;
    }

    export interface TableValue extends BaseNode {
        type: "TableValue";
        value: Expression;
    }

    export interface TableConstructorExpression extends BaseNode {
        type: "TableConstructorExpression";
        fields: (TableKey | TableKeyString | TableValue)[];
    }

    export interface UnaryExpression extends BaseNode {
        type: "UnaryExpression";
        operator: string;
        argument: Expression;
    }

    export interface BinaryExpression extends BaseNode {
        type: "BinaryExpression";
        operator: string;
        left: Expression;
        right: Expression;
    }

    export interface LogicalExpression extends BaseNode {
        type: "LogicalExpression";
        operator: string;
        left: Expression;
        right: Expression;
    }

    export interface MemberExpression extends BaseNode {
        type: "MemberExpression";
        indexer: string;
        identifier: Identifier;
        base: Expression;
    }

    export interface IndexExpression extends BaseNode {
        type: "IndexExpression";
        base: Expression;
        index: Expression;
    }

    export interface CallExpression extends BaseNode {
        type: "CallExpression";
        base: Expression;
        arguments: Expression[];
    }

    export interface TableCallExpression extends BaseNode {
        type: "TableCallExpression";
        base: Expression;
        arguments: TableConstructorExpression;
    }

    export interface StringCallExpression extends BaseNode {
        type: "StringCallExpression";
        base: Expression;
        argument: StringLiteral;
    }

    export interface FunctionDeclaration extends BaseNode {
        type: "FunctionDeclaration";
        identifier: Identifier | MemberExpression | null;
        isLocal: boolean;
        parameters: (Identifier | VarargLiteral)[];
        body: Statement[];
    }

    export interface LocalStatement extends BaseNode {
        type: "LocalStatement";
        variables: Identifier[];
        init: Expression[];
    }

    export interface AssignmentStatement extends BaseNode {
        type: "AssignmentStatement";
        variables: (Identifier | MemberExpression | IndexExpression)[];
        init: Expression[];
    }

    export interface CallStatement extends BaseNode {
        type: "CallStatement";
        expression: CallExpression | TableCallExpression | StringCallExpression;
    }

    export interface IfStatement extends BaseNode {
        type: "IfStatement";
        clauses: IfClause[];
    }

    export interface IfClause extends BaseNode {
        type: "IfClause" | "ElseifClause" | "ElseClause";
        condition?: Expression;
        body: Statement[];
    }

    export interface WhileStatement extends BaseNode {
        type: "WhileStatement";
        condition: Expression;
        body: Statement[];
    }

    export interface DoStatement extends BaseNode {
        type: "DoStatement";
        body: Statement[];
    }

    export interface RepeatStatement extends BaseNode {
        type: "RepeatStatement";
        condition: Expression;
        body: Statement[];
    }

    export interface ForNumericStatement extends BaseNode {
        type: "ForNumericStatement";
        variable: Identifier;
        start: Expression;
        end: Expression;
        step?: Expression;
        body: Statement[];
    }

    export interface ForGenericStatement extends BaseNode {
        type: "ForGenericStatement";
        variables: Identifier[];
        iterators: Expression[];
        body: Statement[];
    }

    export interface ReturnStatement extends BaseNode {
        type: "ReturnStatement";
        arguments: Expression[];
    }

    export interface BreakStatement extends BaseNode {
        type: "BreakStatement";
    }

    export interface GotoStatement extends BaseNode {
        type: "GotoStatement";
        label: Identifier;
    }

    export interface LabelStatement extends BaseNode {
        type: "LabelStatement";
        label: Identifier;
    }

    export type Expression =
        | Identifier
        | StringLiteral
        | NumericLiteral
        | BooleanLiteral
        | NilLiteral
        | VarargLiteral
        | TableConstructorExpression
        | UnaryExpression
        | BinaryExpression
        | LogicalExpression
        | MemberExpression
        | IndexExpression
        | CallExpression
        | TableCallExpression
        | StringCallExpression
        | FunctionDeclaration;

    export type Statement =
        | LocalStatement
        | AssignmentStatement
        | CallStatement
        | IfStatement
        | WhileStatement
        | DoStatement
        | RepeatStatement
        | ForNumericStatement
        | ForGenericStatement
        | ReturnStatement
        | BreakStatement
        | GotoStatement
        | LabelStatement
        | FunctionDeclaration;

    export type Node = Expression | Statement | IfClause | TableKey | TableKeyString | TableValue;

    export interface Chunk extends BaseNode {
        type: "Chunk";
        body: Statement[];
        comments?: Comment[];
    }

    export interface Comment extends BaseNode {
        type: "Comment";
        value: string;
        raw: string;
    }

    export function parse(code: string, options?: ParseOptions): Chunk;
}
