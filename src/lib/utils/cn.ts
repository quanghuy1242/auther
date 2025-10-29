import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes with clsx and tailwind-merge
 * Combines conditional class logic with intelligent Tailwind class deduplication
 * 
 * @example
 * cn("px-4 py-2", isActive && "bg-primary", "px-6") // "py-2 bg-primary px-6"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
