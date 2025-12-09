# Comprehensive Lua Editor Test Suite

> **Goal**: Cover ALL Lua language constructs for type inference, hover, highlighting, autocomplete, and inlay hints.

---

## 1. Variables & Assignments

### Local Variables
- [ ] `local x` (uninitialized)
- [ ] `local x = 1`
- [ ] `local x, y = 1, 2` (multiple assignment)
- [ ] `local x, y = fn()` (multi-return)
- [ ] `local x = nil`

### Global Variables
- [ ] `x = 1` (implicit global)
- [ ] Reference to global
- [ ] Unknown global warning

### Shadowing
- [ ] `local x = 1; do local x = 2 end` (inner shadows outer)
- [ ] Parameter shadowing local

---

## 2. Functions

### Function Declarations
- [ ] `function foo() end` (global)
- [ ] `local function foo() end` (local)
- [ ] `local foo = function() end` (anonymous)
- [ ] `t.foo = function() end` (method)
- [ ] `function t:foo() end` (colon syntax)

### Parameters
- [ ] `function(a, b, c)`
- [ ] `function(...)` (varargs)
- [ ] `function(a, ...)` (mixed)

### Return Values
- [ ] `return x`
- [ ] `return x, y` (multiple)
- [ ] `return { a = 1 }` (table)
- [ ] No return (implicit nil)

### Closures/Upvalues
- [ ] `local x; local function f() return x end`
- [ ] Nested closures

---

## 3. Tables

### Construction
- [ ] `{}` (empty)
- [ ] `{ a = 1 }` (key-value)
- [ ] `{ 1, 2, 3 }` (array)
- [ ] `{ [expr] = val }` (computed key)
- [ ] `{ ["key"] = val }` (string key)
- [ ] Nested: `{ a = { b = 1 } }`
- [ ] Mixed: `{ 1, a = 2, [3] = 3 }`

### Access
- [ ] `t.field`
- [ ] `t["field"]`
- [ ] `t[1]` (index)
- [ ] `t.a.b.c` (chained)
- [ ] `t[expr]` (computed)

### Assignment
- [ ] `t.field = val`
- [ ] `t.a.b = val` (nested)

---

## 4. Control Flow

### If/Else
- [ ] `if cond then end`
- [ ] `if cond then else end`
- [ ] `if cond then elseif cond then else end`

### Loops
- [ ] `for i = 1, 10 do end`
- [ ] `for i = 1, 10, 2 do end` (step)
- [ ] `for k, v in pairs(t) do end`
- [ ] `for k, v in ipairs(t) do end`
- [ ] `while cond do end`
- [ ] `repeat until cond`

### Control
- [ ] `break`
- [ ] `return` (early)
- [ ] `goto label` / `::label::`

---

## 5. Expressions

### Literals
- [ ] Numbers: `1`, `3.14`, `0xFF`, `1e10`
- [ ] Strings: `"str"`, `'str'`, `[[multi]]`
- [ ] Boolean: `true`, `false`
- [ ] Nil: `nil`

### Operators
- [ ] Arithmetic: `+`, `-`, `*`, `/`, `//`, `%`, `^`
- [ ] Comparison: `==`, `~=`, `<`, `>`, `<=`, `>=`
- [ ] Logical: `and`, `or`, `not`
- [ ] Concat: `..`
- [ ] Length: `#`
- [ ] Unary: `-x`

### Complex Expressions
- [ ] `a or b` → type union
- [ ] `a and b` → type of b (if truthy)
- [ ] `cond and x or y` → ternary pattern
- [ ] `x or default` (nil coalescing)

---

## 6. Calls

### Function Calls
- [ ] `fn()`
- [ ] `fn(a, b)`
- [ ] `fn "str"` (string sugar)
- [ ] `fn { }` (table sugar)
- [ ] `obj:method()` (colon call)

### Chained Calls
- [ ] `a():b():c()`
- [ ] `t.fn().field`

---

## 7. Standard Library

### String
- [ ] `string.sub(s, i, j)`
- [ ] `string.format(...)`
- [ ] `s:sub(i, j)` (method style)

### Table
- [ ] `table.insert(t, v)`
- [ ] `table.concat(t, sep)`

### Math
- [ ] `math.floor(x)`
- [ ] `math.random()`

### Other
- [ ] `type(x)`
- [ ] `tonumber(s)`
- [ ] `tostring(n)`
- [ ] `pairs(t)`, `ipairs(t)`
- [ ] `print(...)`

---

## 8. Sandbox-Specific (context/helpers)

### context.*
- [ ] `context.user` → PipelineUser
- [ ] `context.session` → PipelineSession
- [ ] `context.request` → RequestInfo
- [ ] `context.email` → string
- [ ] `context.prev` → table
- [ ] `context.outputs["id"]` → table

### helpers.*
- [ ] `helpers.fetch(url)` → {status, body, headers}
- [ ] `helpers.log(...)` → nil
- [ ] `helpers.matches(pat, s)` → boolean
- [ ] `helpers.now()` → number
- [ ] `helpers.hash(s)` → string

### Disabled Globals
- [ ] `os` → error/warning
- [ ] `io` → error/warning
- [ ] `loadfile` → error/warning

---

## 9. Edge Cases

### Incomplete Code
- [ ] `local x =` (no init)
- [ ] `t.` (trailing dot)
- [ ] `function(` (unclosed)
- [ ] `{` (unclosed table)

### Comments
- [ ] `-- single line`
- [ ] `--[[ multi line ]]`
- [ ] LuaDoc: `--- @param x string`
- [ ] LuaDoc: `--- @return boolean`

### Whitespace/Formatting
- [ ] Multi-line tables
- [ ] Chained calls with newlines

---

## Feature Coverage Matrix

| Feature | Inference | Hover | Highlight | Complete | Inlay |
|---------|-----------|-------|-----------|----------|-------|
| Local var | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ |
| Table field | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ |
| Nested table | ✅ | ⚠️ | ⚠️ | ✅ | ❌ |
| Function decl | ⚠️ | ⚠️ | ✅ | ✅ | ❌ |
| Parameters | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Upvalues | ❌ | ❌ | ✅ | ❌ | ❌ |
| Chain access | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ |
| context.* | ✅ | ✅ | ✅ | ✅ | ✅ |
| helpers.* | ✅ | ✅ | ✅ | ✅ | ✅ |

**Legend**: ✅ Working | ⚠️ Partial/Buggy | ❌ Missing

---

## Priority Order

1. **P0 (Critical)**: Chain assignment (`o = t.d.e`), Table key hover
2. **P1 (High)**: Function return types, Parameter hints
3. **P2 (Medium)**: Multi-return, Upvalue handling
4. **P3 (Low)**: Computed keys, Varargs
