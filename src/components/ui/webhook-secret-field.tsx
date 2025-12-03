"use client"

import { useState } from "react"
import { Button } from "./button"
import { Modal, ModalFooter } from "./modal"
import { CopyableInput } from "./copyable-input"
import { Alert } from "./alert"

interface WebhookSecretFieldProps {
  secret: string
  isNewSecret?: boolean
  onRegenerate?: () => void
  readOnly?: boolean
  className?: string
}

export function WebhookSecretField({
  secret,
  isNewSecret = false,
  onRegenerate,
  readOnly = false,
  className = "",
}: WebhookSecretFieldProps) {
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)

  const handleRegenerate = () => {
    setShowRegenerateModal(false)
    onRegenerate?.()
  }

  return (
    <div className={className}>
      {isNewSecret && (
        <div className="space-y-3 mb-4">
          <label className="block text-base font-medium text-[var(--color-text-primary)]">
            Secret
          </label>
          <Alert variant="warning">
            This is the only time you will see this secret. Copy it now and store it securely.
          </Alert>
        </div>
      )}

      <div className="space-y-2">
        <CopyableInput
          value={secret}
          readOnly={readOnly}
        />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {readOnly 
            ? "Secret is hidden for security. Regenerate to get a new secret."
            : "Use this secret to verify webhook signatures from our servers"
          }
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
          <Alert variant="warning" title="This action cannot be undone">
            Regenerating the secret will invalidate the current secret. Any webhooks using the
            old secret will fail until updated.
          </Alert>

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
  )
}
