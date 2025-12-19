// Extension factories for different languages
export { createJsonExtensions, JSON_TOOLTIP_STYLES, type JsonLanguageOptions } from "./json";

// Lua extensions - re-exported from the moved lua-extensions-2
export {
    createLuaExtensions,
    LUA_TOOLTIP_STYLES,
    type LuaExtensionsOptions,
} from "./lua";

// Alias for backward compatibility
export type { LuaExtensionsOptions as LuaLanguageOptions } from "./lua";
