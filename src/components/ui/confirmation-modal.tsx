"use client";

import * as React from "react";
import { Modal, ModalFooter, Button, Alert } from "@/components/ui";

export interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    description?: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "info";
    loading?: boolean;
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Are you sure?",
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger",
    loading = false,
}: ConfirmationModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="space-y-4">
                {description && (
                    <div className="text-sm text-gray-300">
                        {description}
                    </div>
                )}

                {variant === "danger" && (
                    <Alert variant="error" title="Warning">
                        This action cannot be undone.
                    </Alert>
                )}
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={loading}>
                    {cancelText}
                </Button>
                <Button
                    variant={variant === "info" ? "primary" : "danger"}
                    onClick={onConfirm}
                    isLoading={loading}
                >
                    {confirmText}
                </Button>
            </ModalFooter>
        </Modal>
    );
}
