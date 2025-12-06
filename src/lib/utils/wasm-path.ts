import path from "path";

/**
 * Gets the correct path to the glue.wasm file.
 * In Next.js, the bundler mangles paths, so we need to resolve it explicitly.
 * 
 * Server-side: Uses process.cwd() to get the project root and resolve to public/glue.wasm
 * Client-side: Uses the URL path to the public asset
 */
export function getWasmPath(): string | undefined {
    if (typeof window === "undefined") {
        return path.join(process.cwd(), "public", "glue.wasm");
    }
    return "/glue.wasm";
}
