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
 * - Custom colors for different toast types
 * - Close button for dismissing toasts
 * - Bottom-right positioning
 * - Rounded corners and soft borders (matches card design)
 * - Accessible with proper ARIA labels
 */
export function ToastProvider() {
  return (
    <Toaster 
      position="top-center"
      theme="dark"
      closeButton
      expand={false}
      visibleToasts={5}
      duration={4000}
      toastOptions={{
        className: 'toast-custom',
        style: {
          background: '#1a2632', // CARD_BG_COLOR
          border: '1px solid #344d65', // BORDER_COLOR_DATA
          borderRadius: '0.75rem', // rounded-xl (12px)
          color: 'rgb(250, 250, 250)', // zinc-50
          padding: '1rem',
          fontSize: '0.875rem', // text-sm
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
        },
        classNames: {
          success: 'toast-success',
          error: 'toast-error',
          warning: 'toast-warning',
          info: 'toast-info',
        },
      }}
      style={{
        // Global toast container styles
      }}
    />
  );
}
