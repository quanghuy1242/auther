# Lua Language Server Protocol (LSP) Implementation

A TypeScript-based Lua LSP implementation specifically designed for the Auther pipeline scripting system. Provides IntelliSense, type checking, and code navigation for Lua scripts embedded in the CodeMirror editor.

---

## Features

### ✅ Implemented

#### **Autocomplete** (`handlers/completion.ts`)
- Global variables (`context`, `helpers`)
- Built-in Lua libraries (`math`, `string`, `table`)
- Local variables and function parameters
- Member access (`.` and `:` methods)
- Hook-specific context fields (e.g., `context.email` for signup hooks)
- Library function signatures with parameter hints

#### **Hover Information** (`handlers/hover.ts`)
- Type information on hover
- Function signatures
- Documentation from `---@` comments
- Multi-return type display
- Flow-based type narrowing results

#### **Go to Definition** (`handlers/definition.ts`)
- Jump to variable declarations
- Jump to function definitions
- Jump to type definitions (classes, aliases)
- Navigate to library definitions (from `lua-builtins.json`)

#### **Find All References** (`handlers/references.ts`)
- Find all usages of variables
- Find all usages of functions
- Scope-aware reference tracking
- Highlight read/write references

#### **Signature Help** (`handlers/signature-help.ts`)
- Function parameter hints as you type
- Show parameter names and types
- Active parameter highlighting
- Overload support

#### **Semantic Tokens** (`handlers/semantic-tokens.ts`)
- Syntax highlighting for:
  - Variables (local, global, parameter)
  - Functions
  - Properties
  - Keywords
  - Types
  - Comments

#### **Diagnostics** (`handlers/diagnostics.ts`)
- Syntax errors
- Undefined global variables
- Type mismatches
- Unused variables
- Script size validation

#### **Document Symbols** (`handlers/document-symbols.ts`)
- Outline view of:
  - Functions
  - Local variables
  - Classes (from `---@class`)
  - Types (from `---@type`)

---

## Architecture

### Core Components

```
lua-extensions-2/
├── analysis/              # Type inference and analysis
│   ├── analyzer.ts       # Main analyzer orchestrator
│   ├── type-system.ts    # Type representation and operations
│   ├── symbol-table.ts   # Symbol tracking and scopes
│   └── flow-graph.ts     # Control flow analysis
│
├── handlers/             # LSP feature handlers
│   ├── completion.ts     # Autocomplete
│   ├── hover.ts          # Hover info
│   ├── definition.ts     # Go to definition
│   ├── references.ts     # Find references
│   ├── signature-help.ts # Parameter hints
│   ├── semantic-tokens.ts# Syntax highlighting
│   ├── diagnostics.ts    # Error checking
│   └── document-symbols.ts # Outline view
│
├── definitions/          # Type definitions and schemas
│   ├── definition-loader.ts  # Loads type definitions
│   ├── lua-builtins.json    # Lua standard library types
│   ├── auther-globals.json  # Custom globals (context, helpers)
│   └── hooks-schema.json    # Hook-specific schemas
│
├── core/                 # Core infrastructure
│   ├── document.ts       # Document model and AST
│   └── lsp-types.ts      # LSP protocol types
│
├── codemirror/           # CodeMirror integration
│   ├── completion-source.ts  # CM autocomplete adapter
│   ├── hover-tooltip.ts     # CM hover adapter
│   └── linter.ts            # CM diagnostic adapter
│
└── protocol/             # LSP protocol definitions
    └── index.ts          # CompletionItem, Diagnostic, etc.
```

---

## Type System

### Built-in Types

```typescript
- Nil         // Lua nil
- Boolean     // true/false
- Number      // Lua numbers
- Integer     // Integer subset
- String      // String literals
- Table       // Generic table
- Function    // Generic function
- Unknown     // Type inference failed
- Any         // Explicitly untyped
```

### Complex Types

```typescript
- TableType   // Table with known fields
  { kind: "table_type", fields: Map<string, FieldInfo> }

- FunctionType // Function with signature
  { kind: "function_type", params: ParamInfo[], returns: LuaType[] }

- UnionType   // Multiple possible types
  { kind: "union", types: LuaType[] }

- LiteralType // Specific literal value
  { kind: "literal", value: string | number | boolean }
```

### Flow-Based Type Narrowing

```lua
local x = getValue() -- inferred as: string | nil

if not x then
    return -- x narrowed to: nil in this branch
end

-- x narrowed to: string in this branch
print(x:upper()) -- autocomplete string methods
```

**Implementation**: [flow-graph.ts](./analysis/flow-graph.ts)

---

## Hook-Specific Features

### Context Field Inference

Each hook type has different `context` fields:

```lua
-- Before Signup Hook
context.email     -- string
context.password  -- string
context.name      -- string | nil

-- Before Signin Hook  
context.email     -- string
context.password  -- string

-- Before API Key Create
context.name      -- string
context.expiresAt -- string | nil
```

**Configuration**: [hooks-schema.json](./definitions/hooks-schema.json)

### Helper Functions

Standard helper functions available in all hooks:

```lua
helpers.matches(str, pattern)  -- boolean
helpers.hash(value)            -- string
helpers.http(url, options)     -- Promise-like
```

**Configuration**: [auther-globals.json](./definitions/auther-globals.json)

---

## How It Works

### 1. Document Parsing

```typescript
// core/document.ts
const ast = luaparse.parse(code, { 
    locations: true,
    ranges: true,
    scope: true 
});
```

Uses `luaparse` to create an AST with position information.

### 2. Type Inference

```typescript
// analysis/analyzer.ts
const analysisResult = analyzeDocument(document, {
    hookName: "before_signup",
    previousScriptCode: "..."
});

// Returns:
{
    symbolTable: SymbolTable,      // All declarations
    types: Map<Node, LuaType>,     // Inferred types
    diagnostics: Diagnostic[],     // Errors/warnings
    flowTree: FlowGraph            // Control flow
}
```

### 3. Completion

```typescript
// handlers/completion.ts
const items = getCompletions(
    document,
    analysisResult,
    position,
    triggerCharacter // "." or undefined
);

// Returns: CompletionItem[]
```

**Completion Providers**:
- `MemberProvider`: `obj.|` completions
- `LocalProvider`: Local variables
- `GlobalProvider`: Global symbols
- `KeywordProvider`: Lua keywords

### 4. Hover

```typescript
// handlers/hover.ts
const hover = getHover(
    document,
    analysisResult,
    position
);

// Returns hover markdown with type and documentation
```

### 5. Diagnostics

```typescript
// handlers/diagnostics.ts
const diagnostics = getDiagnostics(
    document,
    analysisResult
);

// Returns: Diagnostic[] (errors, warnings, info)
```

---

## Integration with CodeMirror

### Autocomplete

```typescript
import { autocompletion } from "@codemirror/autocomplete";
import { createCompletionSource } from "./codemirror/completion-source";

const extensions = [
    autocompletion({
        override: [
            createCompletionSource({ hookName: "before_signup" })
        ]
    })
];
```

### Hover Tooltips

```typescript
import { hoverTooltip } from "@codemirror/view";
import { createHoverTooltip } from "./codemirror/hover-tooltip";

const extensions = [
    hoverTooltip(createHoverTooltip({ hookName: "before_signup" }))
];
```

### Linting

```typescript
import { linter } from "@codemirror/lint";
import { createLuaLinter } from "./codemirror/linter";

const extensions = [
    linter(createLuaLinter({ hookName: "before_signup" }))
];
```

---

## Known Limitations

### Not Implemented
- ❌ `type(x) == "string"` narrowing (in progress)
- ❌ Table field completion in literals `{ | }`
- ❌ Rename symbol
- ❌ Code actions (extract variable, etc.)
- ❌ Call hierarchy
- ❌ Inlay hints

### Partial Support
- ⚠️ Generic type instantiation (basic only)
- ⚠️ Variadic type unpacking (basic only)
- ⚠️ Operator overloading (not supported)
- ⚠️ Metatable `__index` resolution (basic only)

See [9_lua_lsp_gaps_analysis.md](../../../../../docs/9_lua_lsp_gaps_analysis.md) for full comparison with EmmyLua.

---

## Performance

### Optimization Strategies

1. **Lazy AST Parsing**
   ```typescript
   // Parse only when needed
   getAST(): LuaSyntaxTree {
       if (!this._ast) {
           this._ast = luaparse.parse(this.text);
       }
       return this._ast;
   }
   ```

2. **Incremental Analysis**
   ```typescript
   // Only re-analyze changed portions
   if (change.from === change.to) {
       // No content change, skip
       return previousResult;
   }
   ```

3. **Symbol Table Caching**
   ```typescript
   // Cache global definitions
   const definitionLoader = getDefinitionLoader(); // Singleton
   ```

### Performance Metrics

| Operation | Time (avg) | Notes |
|-----------|------------|-------|
| Parse 100 lines | ~5ms | luaparse overhead |
| Type inference | ~10ms | Symbol table + flow graph |
| Completion | ~2ms | Cached symbol lookup |
| Hover | ~1ms | Direct type lookup |
| Diagnostics | ~15ms | Full analysis |

**Target**: Scripts < 200 lines (pipeline use case)

---

## Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test completion.test.ts
```

### Test Coverage

```typescript
// Example test structure
describe("CompletionProvider", () => {
    it("should suggest math library methods", () => {
        const code = "math.";
        const completions = getCompletions(/* ... */);
        expect(completions).toContainEqual(
            expect.objectContaining({ label: "abs" })
        );
    });
});
```

### Manual Testing

Use the interactive editor in `/admin/pipelines/editor`:

1. Open script editor
2. Type `math.`
3. Verify autocomplete shows: `abs`, `floor`, `ceil`, etc.
4. Hover over `math.floor`
5. Verify signature: `function floor(x: number): integer`

---

## Debugging

### Enable Debug Logging

```typescript
// In browser console
localStorage.setItem("lua-lsp-debug", "true");

// You'll see logs like:
// [MemberProvider] addCompletions called, trigger: dot
// [MemberProvider] Resolved type for math: table_type
// [buildTableTypeFromDefinitions] Created TableType with 27 fields
```

### Debug Tools

1. **AST Inspector**
   ```typescript
   console.log(JSON.stringify(document.getAST(), null, 2));
   ```

2. **Type Dump**
   ```typescript
   console.log(analysisResult.types);
   ```

3. **Symbol Table Dump**
   ```typescript
   console.log(analysisResult.symbolTable.dumpHierarchy());
   ```

4. **Flow Graph Visualization**
   ```typescript
   console.log(analysisResult.flowTree.toDot());
   // Paste into https://dreampuf.github.io/GraphvizOnline/
   ```

---

## Configuration

### Hook Configuration

Add new hook types in [hooks-schema.json](./definitions/hooks-schema.json):

```json
{
    "before_custom_hook": {
        "description": "Runs before custom action",
        "context": {
            "fields": {
                "customField": {
                    "kind": "property",
                    "type": "string",
                    "description": "Custom field value"
                }
            }
        }
    }
}
```

### Global Functions

Add new globals in [auther-globals.json](./definitions/auther-globals.json):

```json
{
    "myHelper": {
        "kind": "function",
        "description": "My custom helper",
        "params": [
            { "name": "input", "type": "string" }
        ],
        "returns": [
            { "type": "boolean" }
        ]
    }
}
```

### Library Extensions

Extend Lua libraries in [lua-builtins.json](./definitions/lua-builtins.json):

```json
{
    "math": {
        "kind": "table",
        "fields": {
            "myCustomMath": {
                "kind": "function",
                "description": "Custom math function",
                "params": [{"name": "x", "type": "number"}],
                "returns": [{"type": "number"}]
            }
        }
    }
}
```

---

## Contributing

### Adding a New Handler

1. Create file in `handlers/`:
   ```typescript
   // handlers/my-feature.ts
   export function myFeature(
       document: LuaDocument,
       analysisResult: AnalysisResult,
       position: Position
   ): MyResult {
       // Implementation
   }
   ```

2. Add CodeMirror integration in `codemirror/`:
   ```typescript
   // codemirror/my-feature-source.ts
   export function createMyFeatureSource() {
       return (context: MyContext) => {
           // Adapt to CodeMirror API
       };
   }
   ```

3. Wire up in editor component:
   ```typescript
   import { myFeatureExtension } from "./lua-extensions-2/codemirror/my-feature-source";
   
   const extensions = [
       myFeatureExtension(options)
   ];
   ```

### Code Style

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use descriptive variable names
- Add JSDoc for public APIs
- Follow existing patterns in handlers

---

## References

### EmmyLua Comparison

This implementation is inspired by but simpler than:
- [EmmyLua Language Server](https://github.com/EmmyLua/EmmyLua-LanguageServer) (Kotlin/Java)
- [EmmyLua Analyzer](https://github.com/CppCXY/EmmyLuaAnalyzer) (C#)

See [comparison document](../../../../../docs/9_lua_lsp_gaps_analysis.md) for detailed feature parity analysis.

### LSP Specification

- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [CodeMirror Autocomplete](https://codemirror.net/docs/ref/#autocomplete)
- [CodeMirror Lint](https://codemirror.net/docs/ref/#lint)

### Lua Language

- [Lua 5.4 Reference](https://www.lua.org/manual/5.4/)
- [luaparse](https://github.com/fstirlitz/luaparse) - AST parser

---

## License

Part of the Auther project. See root LICENSE file.
