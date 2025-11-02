"use client";

import { Toaster } from 'sonner';

/**
 * Toast Provider Component
 * 
 * Provides toast notification functionality throughout the application.
 * Should be included once at the root layout level.
 * 
 * Features:
 * - Dark theme support (matches application theme)
 * - Rich colors for different toast types
 * - Close button for dismissing toasts
 * - Bottom-right positioning
 * - Accessible with proper ARIA labels
 */
export function ToastProvider() {
  return (
    <Toaster 
      position="bottom-right"
      theme="dark"
      richColors
      closeButton
      expand={false}
      visibleToasts={5}
      duration={4000}
      toastOptions={{
        style: {
          background: 'rgb(24, 24, 27)', // zinc-900
          border: '1px solid rgb(39, 39, 42)', // zinc-800
          color: 'rgb(250, 250, 250)', // zinc-50
        },
      }}
    />
  );
}
