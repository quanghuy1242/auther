"use client";

import * as React from "react";
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  showCloseButton?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: "w-[calc(100%-2rem)] md:max-w-md",
  md: "w-[calc(100%-2rem)] md:max-w-lg",
  lg: "w-[calc(100%-2rem)] md:max-w-2xl",
  xl: "w-[calc(100%-2rem)] md:max-w-6xl",
};

/**
 * Modal dialog component using Headless UI Dialog
 * Provides accessible modal with backdrop, transitions, and focus management
 * 
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Delete User"
 *   description="This action cannot be undone."
 * >
 *   <div className="mt-4">
 *     <Button variant="danger" onClick={handleDelete}>Delete</Button>
 *   </div>
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  showCloseButton = true,
  className,
}: ModalProps) {
  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4 text-center">
            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className={cn(
                  "w-full transform overflow-hidden rounded-xl",
                  "bg-[#1a2632] border border-[#243647]",
                  "p-4 sm:p-6 text-left align-middle shadow-xl transition-all",
                  sizeStyles[size],
                  className
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    {title && (
                      <DialogTitle
                        as="h3"
                        className="text-lg font-semibold leading-6 text-white"
                      >
                        {title}
                      </DialogTitle>
                    )}
                    {description && (
                      <p className="mt-1 text-sm text-gray-400">{description}</p>
                    )}
                  </div>
                  {showCloseButton && (
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg p-1 text-gray-400 flex",
                        "hover:bg-white/5 hover:text-white",
                        "focus:outline-none focus:ring-2 focus:ring-white/50",
                        "transition-colors"
                      )}
                      onClick={onClose}
                    >
                      <Icon name="close" size="sm" />
                    </button>
                  )}
                </div>
                {children}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3",
        "mt-6 pt-6 border-t border-gray-700",
        className
      )}
    >
      {children}
    </div>
  );
}
