"use client";

import { useState } from "react";
import { Button } from "./button";
import { Modal, ModalFooter } from "./modal";

interface WebhookSecretFieldProps {
  secret: string;
  isNewSecret?: boolean; // Show warning for newly created secrets
  onRegenerate?: () => void;
  className?: string;
}

export function WebhookSecretField({
  secret,
  isNewSecret = false,
  onRegenerate,
  className = "",
}: WebhookSecretFieldProps) {
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);

  const handleRegenerate = () => {
    setShowRegenerateModal(false);
    onRegenerate?.();
  };

  return (
    <div className={className}>
      {isNewSecret && (
        <div className="space-y-3 mb-4">
          <label className="block text-base font-medium text-[var(--color-text-primary)]">
            Secret
          </label>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-400 text-2xl shrink-0">
              warning
            </span>
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              This is the only time you will see this secret. Copy it now and store it securely.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div 
          className="flex items-stretch rounded-lg border border-white/10"
          style={{ backgroundColor: '#1a2632' }}
        >
          <input
            type="text"
            readOnly
            value={secret}
            className="flex-1 px-4 py-3 bg-transparent font-mono text-sm focus:outline-none rounded-l-lg"
            style={{ color: 'var(--color-text-primary)' }}
          />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(secret);
            }}
            className="px-4 bg-transparent hover:bg-white/5 transition-colors flex items-center justify-center rounded-r-lg border-l border-white/10"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
            aria-label="Copy secret"
          >
            <span className="material-symbols-outlined !text-xl">content_copy</span>
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Use this secret to verify webhook signatures from our servers
        </p>
      </div>

      {onRegenerate && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowRegenerateModal(true)}
            className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 font-medium transition-colors"
          >
            Regenerate secret
          </button>
        </div>
      )}

      {/* Regenerate Confirmation Modal */}
      <Modal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        title="Regenerate Webhook Secret"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="material-symbols-outlined text-yellow-500 text-xl shrink-0">
              warning
            </span>
            <div className="text-sm">
              <p className="font-medium text-yellow-500 mb-1">This action cannot be undone</p>
              <p className="text-[var(--color-text-secondary)]">
                Regenerating the secret will invalidate the current secret. Any webhooks using the
                old secret will fail until updated.
              </p>
            </div>
          </div>

          <p className="text-sm text-[var(--color-text-secondary)]">
            After regeneration, you&apos;ll need to update the secret in all systems that consume this
            webhook.
          </p>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowRegenerateModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRegenerate}>
            Regenerate Secret
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
