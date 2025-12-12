/**
 * JSON language extensions for CodeEditor
 * Provides syntax highlighting, validation, autocomplete from JSON Schema
 */

import type { Extension } from "@codemirror/state";
import type { JSONSchema7 } from "json-schema";
import { json } from "@codemirror/lang-json";
import { jsonSchema } from "codemirror-json-schema";

export interface JsonLanguageOptions {
  /**
   * Optional JSON Schema for validation, autocomplete, and hover.
   * If not provided, only syntax highlighting is enabled.
   */
  schema?: JSONSchema7;
}

/**
 * Creates JSON language extensions for CodeMirror 6.
 * Includes syntax highlighting, and optionally schema-based validation/autocomplete.
 */
export function createJsonExtensions(options: JsonLanguageOptions = {}): Extension[] {
  // If schema provided, use the full jsonSchema bundle (includes json(), linter, autocomplete, hover)
  // Otherwise just use basic json() syntax highlighting
  if (options.schema) {
    return jsonSchema(options.schema);
  }

  return [json()];
}

// CSS styles for JSON schema tooltips/errors
// codemirror-json-schema uses cm6-json-schema-hover class
export const JSON_TOOLTIP_STYLES = `
/* JSON hover tooltip container - matches Lua editor styling */
.cm6-json-schema-hover {
  background: #282c34;
  border: 1px solid #3e4451;
  border-radius: 6px;
  padding: 8px 12px;
  max-width: 500px;
  font-size: 13px;
  line-height: 1.5;
  color: #abb2bf;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

/* Type code styling */
.cm6-json-schema-hover--code-wrapper {
  display: inline-block;
}

.cm6-json-schema-hover--code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: #e5c07b;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
}

/* JSON completion info panel */
.cm-completionInfo {
  padding: 8px 12px;
  max-width: 400px;
  font-size: 13px;
  line-height: 1.4;
  background-color: #282c34;
  border: 1px solid #3e4451;
  border-radius: 6px;
  color: #abb2bf;
}
`;
