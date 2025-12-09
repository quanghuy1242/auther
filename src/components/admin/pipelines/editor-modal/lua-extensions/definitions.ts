// =============================================================================
// LUA SANDBOX API DEFINITIONS
// =============================================================================
// Static definitions for autocomplete, hover docs, and validation

import type { HookExecutionMode } from "@/schemas/pipelines";

// =============================================================================
// HELPER FUNCTION DEFINITIONS
// =============================================================================

export interface HelperParam {
    name: string;
    type: string;
    description: string;
    optional?: boolean;
}

export interface HelperDefinition {
    name: string;
    signature: string;
    description: string;
    params: HelperParam[];
    returns: string;
    example?: string;
}

export const HELPERS_DEFINITIONS: HelperDefinition[] = [
    {
        name: "log",
        signature: "helpers.log(data)",
        description: "Write data to the execution log for debugging",
        params: [{ name: "data", type: "any", description: "Data to log (string, table, etc.)" }],
        returns: "nil",
        example: 'helpers.log("User email: " .. context.email)',
    },
    {
        name: "hash",
        signature: 'helpers.hash(text, algo?)',
        description: "Generate a cryptographic hash of the input text",
        params: [
            { name: "text", type: "string", description: "Text to hash" },
            { name: "algo", type: '"sha256" | "md5"', description: "Hash algorithm (default: sha256)", optional: true },
        ],
        returns: "string",
        example: 'local hashed = helpers.hash(context.email, "sha256")',
    },
    {
        name: "matches",
        signature: "helpers.matches(str, pattern)",
        description: "Check if a string matches a Lua pattern",
        params: [
            { name: "str", type: "string", description: "String to test" },
            { name: "pattern", type: "string", description: "Lua pattern (use %% to escape special chars)" },
        ],
        returns: "boolean",
        example: 'if helpers.matches(email, "@blocked%.com$") then ... end',
    },
    {
        name: "now",
        signature: "helpers.now()",
        description: "Get current Unix timestamp in milliseconds",
        params: [],
        returns: "integer",
        example: "local timestamp = helpers.now()",
    },
    {
        name: "env",
        signature: "helpers.env(key)",
        description: "Get an allowed environment variable (whitelist only)",
        params: [{ name: "key", type: "string", description: "Environment variable name" }],
        returns: "string | nil",
        example: 'local domain = helpers.env("ALLOWED_DOMAIN")',
    },
    {
        name: "secret",
        signature: "helpers.secret(key)",
        description: "Get a secret from encrypted storage",
        params: [{ name: "key", type: "string", description: "Secret name (configured in admin)" }],
        returns: "string | nil",
        example: 'local apiKey = helpers.secret("STRIPE_KEY")',
    },
    {
        name: "fetch",
        signature: "helpers.fetch(url, options?)",
        description: "Make an HTTPS request (SSRF-protected, HTTPS-only)",
        params: [
            { name: "url", type: "string", description: "Target URL (must be HTTPS)" },
            {
                name: "options",
                type: "table",
                description: "Request options: method, headers, body",
                optional: true,
            },
        ],
        returns: "{ status: number, body: string, headers: table }",
        example: `local resp = helpers.fetch("https://api.example.com/check", {
  method = "POST",
  headers = { ["Content-Type"] = "application/json" },
  body = '{"email": "' .. context.email .. '"}'
})`,
    },
    {
        name: "trace",
        signature: "helpers.trace(name, [attributes,] fn)",
        description: "Create a custom tracing span. Max 2 nesting levels. Span auto-closes when function returns. Return values pass through.",
        params: [
            { name: "name", type: "string", description: "Span name (e.g., 'Fetch User Data')" },
            { name: "attributes", type: "table", description: "Optional key-value metadata for the span", optional: true },
            { name: "fn", type: "function", description: "Work to trace (executed synchronously)" },
        ],
        returns: "any -- Return value from fn",
        example: `-- Simple trace
helpers.trace("Validate Email", function()
    helpers.log("Checking email format...")
end)

-- With attributes and return value
local user = helpers.trace("Fetch User", {
    userId = context.userId,
    source = "database"
}, function()
    return helpers.fetch("https://api.example.com/user")
end)`,
    },
];

// =============================================================================
// CONTEXT FIELD DEFINITIONS
// =============================================================================

export interface ContextField {
    name: string;
    type: string;
    description: string;
    optional?: boolean;
}

export const CONTEXT_FIELDS_UNIVERSAL: ContextField[] = [
    { name: "trigger_event", type: "string", description: "Current hook name (e.g., 'before_signup')" },
    { name: "prev", type: "table | nil", description: "Merged data from previous script layer" },
    { name: "outputs", type: "table<string, table>", description: "Outputs keyed by script ID (for DAG access)" },
];

export const CONTEXT_FIELDS_BY_HOOK: Record<string, ContextField[]> = {
    before_signup: [
        { name: "email", type: "string", description: "User's email address" },
        { name: "name", type: "string", description: "User's display name", optional: true },
        { name: "request", type: "RequestInfo", description: "Request metadata (ip, userAgent, origin)" },
    ],
    after_signup: [
        { name: "user", type: "PipelineUser", description: "Created user object" },
        { name: "request", type: "RequestInfo", description: "Request metadata" },
    ],
    before_signin: [
        { name: "email", type: "string", description: "User's email address" },
        { name: "request", type: "RequestInfo", description: "Request metadata" },
    ],
    after_signin: [
        { name: "user", type: "PipelineUser", description: "Authenticated user object" },
        { name: "session", type: "PipelineSession", description: "Created session object" },
    ],
    before_signout: [
        { name: "user", type: "PipelineUser", description: "Current user object" },
        { name: "session", type: "PipelineSession", description: "Session being terminated" },
    ],
    token_build: [
        { name: "user", type: "PipelineUser", description: "User for token generation" },
        { name: "token", type: "table", description: "Existing token claims" },
    ],
    apikey_before_create: [
        { name: "userId", type: "string", description: "Owner user ID" },
        { name: "name", type: "string", description: "API key name", optional: true },
        { name: "permissions", type: "string[]", description: "Requested permissions", optional: true },
    ],
    apikey_after_create: [
        { name: "apikey", type: "PipelineApiKey", description: "Created API key object" },
        { name: "userId", type: "string", description: "Owner user ID" },
    ],
    apikey_before_exchange: [
        { name: "apikey", type: "PipelineApiKey", description: "API key being exchanged" },
        { name: "request", type: "RequestInfo", description: "Request metadata" },
    ],
    apikey_after_exchange: [{ name: "apikey", type: "PipelineApiKey", description: "Exchanged API key" }],
    apikey_before_revoke: [{ name: "apikey", type: "PipelineApiKey", description: "API key to revoke" }],
    client_before_register: [
        { name: "name", type: "string", description: "OAuth client name" },
        { name: "redirectUrls", type: "string[]", description: "Redirect URLs" },
        { name: "type", type: '"public" | "confidential"', description: "Client type", optional: true },
    ],
    client_after_register: [{ name: "client", type: "OAuthClient", description: "Created OAuth client" }],
    client_before_authorize: [
        { name: "user", type: "PipelineUser", description: "User authorizing" },
        { name: "client", type: "OAuthClient", description: "OAuth client requesting access" },
        { name: "scopes", type: "string[]", description: "Requested scopes" },
    ],
    client_after_authorize: [
        { name: "user", type: "PipelineUser", description: "User who authorized" },
        { name: "client", type: "OAuthClient", description: "Authorized client" },
        { name: "grant", type: "{ scopes: string[] }", description: "Granted permissions" },
    ],
    client_access_change: [
        { name: "user", type: "PipelineUser", description: "Affected user" },
        { name: "client", type: "OAuthClient", description: "OAuth client" },
        { name: "action", type: '"grant" | "revoke"', description: "Action performed" },
    ],
};

// =============================================================================
// DISABLED GLOBALS
// =============================================================================

export const DISABLED_GLOBALS = [
    "os",
    "io",
    "package",
    "loadfile",
    "dofile",
    "loadstring",
    "rawset",
    "rawget",
    "require",
    "load",
    "getfenv",
    "setfenv",
    "newproxy",
] as const;

export const DISABLED_GLOBAL_MESSAGES: Record<string, string> = {
    os: "The 'os' module is disabled for security. Use helpers.now() for timestamps.",
    io: "The 'io' module is disabled. Use helpers.fetch() for HTTP requests.",
    package: "The 'package' module is disabled. External modules cannot be loaded.",
    loadfile: "loadfile() is disabled. Scripts cannot load external files.",
    dofile: "dofile() is disabled. Scripts cannot execute external files.",
    loadstring: "loadstring() is disabled. Dynamic code execution is not allowed.",
    rawset: "rawset() is disabled to prevent metatable bypasses.",
    rawget: "rawget() is disabled to prevent metatable bypasses.",
    debug: "The 'debug' library is disabled for security.",
    require: "require() is disabled. External modules cannot be loaded.",
    load: "load() is disabled. Dynamic code execution is not allowed.",
    getfenv: "getfenv() is disabled for security.",
    setfenv: "setfenv() is disabled for security.",
    newproxy: "newproxy() is disabled for security.",
};

// =============================================================================
// LUA BUILTIN DOCUMENTATION
// =============================================================================

export const LUA_BUILTIN_DOCS: Record<string, { signature: string; description: string }> = {
    // Globals
    print: {
        signature: "print(...)",
        description: "Prints values to the output log.",
    },
    await: {
        signature: "await(promise)",
        description: "Waits for an async operation (like helpers.fetch) to complete.",
    },
    pairs: {
        signature: "pairs(t)",
        description: "Returns an iterator function for traversing all key-value pairs in table t.",
    },
    ipairs: {
        signature: "ipairs(t)",
        description:
            "Returns an iterator function for traversing the array part of table t (integer keys 1, 2, 3...).",
    },
    tonumber: {
        signature: "tonumber(e, base?)",
        description:
            "Converts e to a number. If e is already a number, returns it. Otherwise tries to parse as number.",
    },
    tostring: {
        signature: "tostring(v)",
        description: "Converts value v to a string.",
    },
    type: {
        signature: "type(v)",
        description: "Returns the type of value v as a string (e.g. 'nil', 'number', 'string').",
    },
    assert: {
        signature: "assert(v, message?)",
        description: "Errors if v is false or nil; otherwise returns v. Message is optional.",
    },
    error: {
        signature: "error(message, level?)",
        description: "Terminates the last protected function called and returns message as the error object.",
    },
    pcall: {
        signature: "pcall(f, ...)",
        description: "Calls function f with the given arguments in protected mode. Returns boolean status and results.",
    },
    xpcall: {
        signature: "xpcall(f, err)",
        description: "Calls function f in protected mode with a new error handler err.",
    },
    select: {
        signature: "select(index, ...)",
        description: "Returns all arguments after argument number index.",
    },
    next: {
        signature: "next(table, index?)",
        description: "Returns the next index of the table and its associated value.",
    },
    getmetatable: {
        signature: "getmetatable(object)",
        description: "Returns the metatable of the given object.",
    },
    setmetatable: {
        signature: "setmetatable(table, metatable)",
        description: "Sets the metatable for the given table.",
    },
    unpack: {
        signature: "unpack(list, i?, j?)",
        description: "Returns the elements from the given list.",
    },

    // String Library
    "string.byte": { signature: "string.byte(s, i?, j?)", description: "Returns the internal numerical codes of the characters s[i], s[i+1], ..., s[j]." },
    "string.char": { signature: "string.char(...)", description: "Receives zero or more integers and returns a string with length equal to the number of arguments." },
    "string.find": { signature: "string.find(s, pattern, init?, plain?)", description: "Looks for the first match of pattern in the string s." },
    "string.format": { signature: "string.format(formatstring, ...)", description: "Returns a formatted version of its variable number of arguments following the description given in its first argument." },
    "string.gmatch": { signature: "string.gmatch(s, pattern)", description: "Returns an iterator function that, each time it is called, returns the next captures from pattern found in the string s." },
    "string.gsub": { signature: "string.gsub(s, pattern, repl, n?)", description: "Returns a copy of s in which all (or the first n) occurrences of the pattern have been replaced by a replacement string specified by repl." },
    "string.len": { signature: "string.len(s)", description: "Receives a string and returns its length." },
    "string.lower": { signature: "string.lower(s)", description: "Receives a string and returns a copy of this string with all uppercase letters changed to lowercase." },
    "string.match": { signature: "string.match(s, pattern, init?)", description: "Looks for the first match of pattern in the string s." },
    "string.rep": { signature: "string.rep(s, n)", description: "Returns a string that is the concatenation of n copies of the string s." },
    "string.reverse": { signature: "string.reverse(s)", description: "Returns a string that is the string s reversed." },
    "string.sub": { signature: "string.sub(s, i, j?)", description: "Returns the substring of s that starts at i and continues until j." },
    "string.upper": { signature: "string.upper(s)", description: "Receives a string and returns a copy of this string with all lowercase letters changed to uppercase." },

    // Table Library
    "table.concat": { signature: "table.concat(list, sep?, i?, j?)", description: "Returns the elements of the given list concatenated, with the optional separator sep." },
    "table.insert": { signature: "table.insert(list, [pos,] value)", description: "Inserts element value at position pos in list." },
    "table.maxn": { signature: "table.maxn(table)", description: "Returns the largest positive numerical index of the given table, or zero if the table has no positive numerical indices." },
    "table.remove": { signature: "table.remove(list, pos?)", description: "Removes from list the element at position pos, returning the value of the removed element." },
    "table.sort": { signature: "table.sort(list, comp?)", description: "Sorts list elements in a given order, in-place, from list[1] to list[#list]." },

    // Math Library
    "math.abs": { signature: "math.abs(x)", description: "Returns the absolute value of x." },
    "math.acos": { signature: "math.acos(x)", description: "Returns the arc cosine of x (in radians)." },
    "math.asin": { signature: "math.asin(x)", description: "Returns the arc sine of x (in radians)." },
    "math.atan": { signature: "math.atan(x)", description: "Returns the arc tangent of x (in radians)." },
    "math.ceil": { signature: "math.ceil(x)", description: "Returns the smallest integer larger than or equal to x." },
    "math.cos": { signature: "math.cos(x)", description: "Returns the cosine of x (assumed to be in radians)." },
    "math.deg": { signature: "math.deg(x)", description: "Returns the angle x (given in radians) in degrees." },
    "math.exp": { signature: "math.exp(x)", description: "Returns the value e^x." },
    "math.floor": { signature: "math.floor(x)", description: "Returns the largest integer smaller than or equal to x." },
    "math.fmod": { signature: "math.fmod(x, y)", description: "Returns the remainder of the division of x by y that rounds the quotient towards zero." },
    "math.frexp": { signature: "math.frexp(x)", description: "Returns m and e such that x = m2^e." },
    "math.ldexp": { signature: "math.ldexp(m, e)", description: "Returns m2^e." },
    "math.log": { signature: "math.log(x)", description: "Returns the natural logarithm of x." },
    "math.log10": { signature: "math.log10(x)", description: "Returns the base-10 logarithm of x." },
    "math.max": { signature: "math.max(x, ...)", description: "Returns the maximum value among its arguments." },
    "math.min": { signature: "math.min(x, ...)", description: "Returns the minimum value among its arguments." },
    "math.modf": { signature: "math.modf(x)", description: "Returns two numbers, the integral part of x and the fractional part of x." },
    "math.pow": { signature: "math.pow(x, y)", description: "Returns x^y." },
    "math.rad": { signature: "math.rad(x)", description: "Returns the angle x (given in degrees) in radians." },
    "math.random": { signature: "math.random(m?, n?)", description: "Returns a pseudo-random number." },
    "math.randomseed": { signature: "math.randomseed(x)", description: "Sets x as the \"seed\" for the pseudo-random generator." },
    "math.sin": { signature: "math.sin(x)", description: "Returns the sine of x (assumed to be in radians)." },
    "math.sqrt": { signature: "math.sqrt(x)", description: "Returns the square root of x." },
    "math.tan": { signature: "math.tan(x)", description: "Returns the tangent of x (assumed to be in radians)." },
};

// =============================================================================
// LUA KEYWORDS
// =============================================================================

export const LUA_KEYWORDS = [
    "and",
    "break",
    "do",
    "else",
    "elseif",
    "end",
    "false",
    "for",
    "function",
    "goto",
    "if",
    "in",
    "local",
    "nil",
    "not",
    "or",
    "repeat",
    "return",
    "then",
    "true",
    "until",
    "while",
] as const;

export const LUA_BUILTINS = [
    "assert",
    "collectgarbage",
    "error",
    "getmetatable",
    "ipairs",
    "next",
    "pairs",
    "pcall",
    "print",
    "select",
    "setmetatable",
    "tonumber",
    "tostring",
    "type",
    "unpack",
    "xpcall",
    // String library
    "string",
    // Table library
    "table",
    // Math library
    "math",
] as const;

// =============================================================================
// RETURN TYPE DEFINITIONS BY EXECUTION MODE
// =============================================================================

export interface ReturnTypeInfo {
    mode: HookExecutionMode;
    description: string;
    requiredFields: string[];
    optionalFields: string[];
    example: string;
}

export const RETURN_TYPES: Record<HookExecutionMode, ReturnTypeInfo> = {
    blocking: {
        mode: "blocking",
        description: "Return { allowed = true/false } to allow or block the action",
        requiredFields: ["allowed"],
        optionalFields: ["error"],
        example: '{ allowed = false, error = "Domain not allowed" }',
    },
    async: {
        mode: "async",
        description: "No return value required (fire-and-forget)",
        requiredFields: [],
        optionalFields: [],
        example: "-- No return needed",
    },
    enrichment: {
        mode: "enrichment",
        description: "Return { allowed = true, data = {...} } to enrich the response",
        requiredFields: ["allowed"],
        optionalFields: ["data"],
        example: '{ allowed = true, data = { customClaim = "value" } }',
    },
};

// =============================================================================
// SNIPPET TEMPLATES
// =============================================================================

export interface SnippetTemplate {
    label: string;
    detail: string;
    template: string;
}

export const SNIPPET_TEMPLATES: SnippetTemplate[] = [
    {
        label: "if-then-end",
        detail: "If statement",
        template: "if ${1:condition} then\n\t${2:-- body}\nend",
    },
    {
        label: "if-then-else",
        detail: "If-else statement",
        template: "if ${1:condition} then\n\t${2:-- true branch}\nelse\n\t${3:-- false branch}\nend",
    },
    {
        label: "for-loop",
        detail: "Numeric for loop",
        template: "for ${1:i} = ${2:1}, ${3:10} do\n\t${4:-- body}\nend",
    },
    {
        label: "for-pairs",
        detail: "Iterate table with pairs",
        template: "for ${1:key}, ${2:value} in pairs(${3:table}) do\n\t${4:-- body}\nend",
    },
    {
        label: "block-action",
        detail: "Block with error message",
        template: 'return { allowed = false, error = "${1:Reason}" }',
    },
    {
        label: "allow-action",
        detail: "Allow the action",
        template: "return { allowed = true }",
    },
    {
        label: "enrich-data",
        detail: "Return enrichment data",
        template: "return { allowed = true, data = { ${1:key} = ${2:value} } }",
    },
    {
        label: "fetch-request",
        detail: "HTTP fetch request",
        template: `local response = helpers.fetch("\${1:https://api.example.com}", {
\tmethod = "\${2:POST}",
\theaders = { ["Content-Type"] = "application/json" },
\tbody = '\${3:{}}'
})
if response.status == 200 then
\t\${4:-- handle success}
end`,
    },
    {
        label: "trace-simple",
        detail: "Create a tracing span",
        template: `helpers.trace("\${1:Span Name}", function()
\t\${2:-- traced work}
end)`,
    },
    {
        label: "trace-with-attrs",
        detail: "Create a tracing span with attributes",
        template: `helpers.trace("\${1:Span Name}", {
\t\${2:key} = \${3:value}
}, function()
\t\${4:-- traced work}
end)`,
    },
];

// =============================================================================
// TYPE DEFINITIONS FOR NESTED OBJECTS
// =============================================================================

export const NESTED_TYPE_FIELDS: Record<string, ContextField[]> = {
    RequestInfo: [
        { name: "ip", type: "string", description: "Client IP address", optional: true },
        { name: "userAgent", type: "string", description: "User agent string", optional: true },
        { name: "origin", type: "string", description: "Request origin", optional: true },
    ],
    PipelineUser: [
        { name: "id", type: "string", description: "User ID" },
        { name: "email", type: "string", description: "User email", optional: true },
        { name: "name", type: "string", description: "User display name", optional: true },
        { name: "role", type: "string", description: "User role", optional: true },
    ],
    PipelineSession: [
        { name: "id", type: "string", description: "Session ID" },
        { name: "userId", type: "string", description: "User ID" },
        { name: "expiresAt", type: "string", description: "Expiration timestamp", optional: true },
    ],
    PipelineApiKey: [
        { name: "id", type: "string", description: "API key ID" },
        { name: "name", type: "string", description: "Key name", optional: true },
        { name: "userId", type: "string", description: "Owner user ID" },
        { name: "permissions", type: "string[]", description: "Permissions array", optional: true },
    ],
    OAuthClient: [
        { name: "clientId", type: "string", description: "OAuth client ID" },
        { name: "name", type: "string", description: "Client name", optional: true },
        { name: "type", type: '"public" | "confidential"', description: "Client type", optional: true },
        { name: "redirectUri", type: "string", description: "Redirect URI", optional: true },
    ],
};
