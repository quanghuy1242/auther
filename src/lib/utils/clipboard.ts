import { useState, useCallback } from "react";

/**
 * Clipboard utilities for copying text with feedback
 */

/**
 * Copy text to clipboard
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 * 
 * @example
 * await copyToClipboard("sk_live_123456")
 */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/**
 * Hook for managing clipboard copy state with automatic reset
 * @param timeout - Time in ms before resetting copied state (default: 2000)
 * @returns Object with copied state and copy function
 * 
 * @example
 * const { copied, handleCopy } = useCopyToClipboard();
 * <button onClick={() => handleCopy("client_id_123", "id")}>
 *   {copied === "id" ? "Copied!" : "Copy"}
 * </button>
 */
export function useCopyToClipboard<T extends string = string>(timeout: number = 2000) {
  const [copied, setCopied] = useState<T | null>(null);

  const handleCopy = useCallback(async (text: string, type: T) => {
    await copyToClipboard(text);
    setCopied(type);
    setTimeout(() => setCopied(null), timeout);
  }, [timeout]);

  return { copied, handleCopy };
}
