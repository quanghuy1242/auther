"use client";

import * as React from "react";
import { Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, Modal, Icon } from "@/components/ui";
import { rotateKeys, type JwksKey } from "./actions";
import { JWKS_ROTATION_INTERVAL_MS } from "@/lib/constants";
import { formatDate, formatAge } from "@/lib/utils/date-formatter";
import { Alert } from "@/components/layout";

interface KeysClientProps {
  initialKeys: JwksKey[];
}

export function KeysClient({ initialKeys }: KeysClientProps) {
  const keys = initialKeys;
  const [showRotateModal, setShowRotateModal] = React.useState(false);
  const [isRotating, setIsRotating] = React.useState(false);
  const [rotationMessage, setRotationMessage] = React.useState<string | null>(null);

  const handleRotateKeys = async () => {
    setIsRotating(true);
    setRotationMessage(null);

    try {
      const result = await rotateKeys();
      
      if (result.success) {
        setRotationMessage(result.message || "Keys rotated successfully");
        // Refresh the page to show new keys
        window.location.reload();
      } else {
        setRotationMessage(result.message || "Failed to rotate keys");
      }
    } catch {
      setRotationMessage("An error occurred while rotating keys");
    } finally {
      setIsRotating(false);
      setTimeout(() => {
        setShowRotateModal(false);
        setRotationMessage(null);
      }, 2000);
    }
  };

  const rotationIntervalDays = Math.floor(JWKS_ROTATION_INTERVAL_MS / (1000 * 60 * 60 * 24));

  return (
    <>
      {/* Alert Card */}
      <Alert variant="info" className="mb-6" title="JWKS Rotation Policy">
        Keys are automatically rotated every {rotationIntervalDays} days. Old keys are retained for
        validation during the transition period.
      </Alert>

      {/* Current Active Keys */}
      <div className="mb-6 rounded-lg border border-white/10" style={{ backgroundColor: '#1a2632' }}>
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Current Active Keys</h3>
            <Button
              variant="primary"
              leftIcon="sync"
              onClick={() => setShowRotateModal(true)}
              size="sm"
            >
              Rotate JWKS
            </Button>
          </div>
        </div>
        <div className="p-6">
          {keys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key ID</TableHead>
                  <TableHead>Algorithm</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key, index) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-gray-200">{key.id}</code>
                        {index === 0 && (
                          <Badge variant="info" className="text-xs">
                            Latest
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-200">RS256</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-400 text-sm">{formatAge(key.age)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-400 text-sm">{formatDate(key.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.status === "ok" ? "success" : "danger"}>
                        {key.status === "ok" ? "OK" : "SLA Breached"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Icon name="key" size="xl" className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No JWKS keys found</p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => setShowRotateModal(true)}
              >
                Create First Key
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Configuration Card */}
      <div className="rounded-lg border border-white/10" style={{ backgroundColor: '#1a2632' }}>
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">Rotation Configuration</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-medium text-gray-400">Rotation Interval</p>
              <p className="text-lg font-semibold text-white mt-1">
                {rotationIntervalDays} days
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">Retention Window</p>
              <p className="text-lg font-semibold text-white mt-1">
                {Math.floor(JWKS_ROTATION_INTERVAL_MS / (1000 * 60 * 60 * 24))} days
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">Active Keys</p>
              <p className="text-lg font-semibold text-white mt-1">{keys.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rotation Confirmation Modal */}
      <Modal
        isOpen={showRotateModal}
        onClose={() => !isRotating && setShowRotateModal(false)}
        title="Rotate JWKS Keys"
        description="This will generate a new signing key and prune old keys beyond the retention window. Active tokens will continue to work during the transition."
      >
        <div className="space-y-4">
          {rotationMessage && (
            <div
              className={`p-3 rounded-lg ${
                rotationMessage.includes("success")
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              <p className="text-sm">{rotationMessage}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRotateModal(false)}
              disabled={isRotating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRotateKeys}
              isLoading={isRotating}
              leftIcon={!isRotating ? "sync" : undefined}
            >
              {isRotating ? "Rotating..." : "Rotate Keys"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
