/**
 * Centralized toast notification utility
 * 
 * Provides a consistent interface for displaying toast notifications throughout the application.
 * Built on top of Sonner for a lightweight, accessible, and customizable experience.
 * 
 * @example
 * ```tsx
 * import { toast } from '@/lib/toast';
 * 
 * // Simple notifications
 * toast.success('User created successfully!');
 * toast.error('Failed to delete item');
 * toast.warning('This action cannot be undone');
 * toast.info('New updates available');
 * 
 * // With descriptions
 * toast.success('Profile updated', 'Your changes have been saved.');
 * 
 * // Promise-based operations
 * toast.promise(
 *   fetchData(),
 *   {
 *     loading: 'Loading data...',
 *     success: 'Data loaded successfully!',
 *     error: 'Failed to load data'
 *   }
 * );
 * ```
 */

import { toast as sonnerToast, type ExternalToast } from 'sonner';

/**
 * Default toast configuration
 */
const DEFAULT_OPTIONS: ExternalToast = {
  duration: 4000,
};

/**
 * Display a success toast notification
 */
export function showSuccess(message: string, description?: string) {
  return sonnerToast.success(message, {
    ...DEFAULT_OPTIONS,
    description,
  });
}

/**
 * Display an error toast notification
 */
export function showError(message: string, description?: string) {
  return sonnerToast.error(message, {
    ...DEFAULT_OPTIONS,
    description,
  });
}

/**
 * Display a warning toast notification
 */
export function showWarning(message: string, description?: string) {
  return sonnerToast.warning(message, {
    ...DEFAULT_OPTIONS,
    description,
  });
}

/**
 * Display an info toast notification
 */
export function showInfo(message: string, description?: string) {
  return sonnerToast.info(message, {
    ...DEFAULT_OPTIONS,
    description,
  });
}

/**
 * Display a loading toast notification
 * Returns the toast ID which can be used to dismiss or update the toast
 */
export function showLoading(message: string, description?: string) {
  return sonnerToast.loading(message, {
    description,
  });
}

/**
 * Display a promise-based toast notification
 * Automatically shows loading, success, and error states
 */
export function showPromise<T>(
  promise: Promise<T> | (() => Promise<T>),
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: Error) => string);
  }
) {
  return sonnerToast.promise(promise, messages);
}

/**
 * Dismiss a specific toast by ID
 */
export function dismiss(toastId?: string | number) {
  sonnerToast.dismiss(toastId);
}

/**
 * Dismiss all active toasts
 */
export function dismissAll() {
  sonnerToast.dismiss();
}

/**
 * Export the raw Sonner toast for advanced use cases
 * Use the helper functions above for most scenarios
 */
export const toast = {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  loading: showLoading,
  promise: showPromise,
  dismiss,
  dismissAll,
  // Raw Sonner toast for custom use cases
  custom: sonnerToast,
};

// Re-export types for convenience
export type { ExternalToast } from 'sonner';
