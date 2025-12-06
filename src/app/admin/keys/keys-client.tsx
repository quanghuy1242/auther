"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Badge, Modal, ResponsiveTable } from "@/components/ui";
import { rotateKeys, type JwksKey } from "./actions";
import { JWKS_ROTATION_INTERVAL_MS } from "@/lib/constants";
import { formatDate, formatAge } from "@/lib/utils/date-formatter";
import { Alert } from "@/components/ui";
import { toast } from "@/lib/toast";

interface KeysClientProps {
  initialKeys: JwksKey[];
}

export function KeysClient({ initialKeys }: KeysClientProps) {
  const router = useRouter();
  const [keys, setKeys] = React.useState(initialKeys);
  const [showRotateModal, setShowRotateModal] = React.useState(false);
  const [isRotating, setIsRotating] = React.useState(false);

  // Update keys when initialKeys change
  React.useEffect(() => {
    setKeys(initialKeys);
  }, [initialKeys]);

  const handleRotateKeys = async () => {
    setIsRotating(true);

    try {
      const result = await rotateKeys();
      
      if (result.success) {
        if (result.rotated) {
          toast.success(result.message || "Keys rotated successfully");
        } else {
          toast.info(result.message || "No rotation needed at this time");
        }
        setShowRotateModal(false);
        // Refresh the page data using Next.js router
        router.refresh();
      } else {
        toast.error(result.message || "Failed to rotate keys");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred while rotating keys";
      toast.error(errorMessage);
    } finally {
      setIsRotating(false);
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
      <div className="mb-6 rounded-lg border border-border-dark bg-card">
        <div className="p-6 border-b border-border-dark">
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
        
        {/* Use ResponsiveTable but maintain the card wrapper style */}
        <div className="border-t-0">
          <ResponsiveTable
            columns={[
              {
                key: "id",
                header: "Key ID",
                render: (key) => (
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-gray-200">{key.id}</code>
                    {keys.indexOf(key) === 0 && (
                      <Badge variant="info" className="text-xs">
                        Latest
                      </Badge>
                    )}
                  </div>
                ),
              },
              {
                key: "algorithm",
                header: "Algorithm",
                render: () => <span className="text-gray-200">RS256</span>,
              },
              {
                key: "age",
                header: "Age",
                render: (key) => <span className="text-gray-400 text-sm">{formatAge(key.age)}</span>,
              },
              {
                key: "createdAt",
                header: "Created At",
                render: (key) => <span className="text-gray-400 text-sm">{formatDate(key.createdAt)}</span>,
              },
              {
                key: "status",
                header: "Status",
                render: (key) => (
                  <Badge variant={key.status === "ok" ? "success" : "danger"}>
                    {key.status === "ok" ? "OK" : "SLA Breached"}
                  </Badge>
                ),
              },
            ]}
            data={keys}
            keyExtractor={(key) => key.id}
            mobileCardRender={(key) => (
              <div className="p-4 border-b border-border-dark last:border-0">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-gray-200">{key.id.substring(0, 12)}...</code>
                    {keys.indexOf(key) === 0 && <Badge variant="info" className="text-xs">Latest</Badge>}
                  </div>
                  <Badge variant={key.status === "ok" ? "success" : "danger"}>
                    {key.status === "ok" ? "OK" : "SLA Breached"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
                  <div>Created: {formatDate(key.createdAt)}</div>
                  <div>Age: {formatAge(key.age)}</div>
                </div>
              </div>
            )}
            emptyMessage="No JWKS keys found"
          />
        </div>
      </div>

      {/* Configuration Card */}
      <div className="rounded-lg border border-border-dark bg-card">
        <div className="p-6 border-b border-border-dark">
          <h3 className="text-lg font-semibold text-white">Rotation Configuration</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium text-gray-400">Rotation Interval</p>
              <p className="text-lg font-semibold text-white mt-1">
                {rotationIntervalDays} days
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Keys are automatically rotated at this interval
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">Active Keys</p>
              <p className="text-lg font-semibold text-white mt-1">{keys.length}</p>
              <p className="text-xs text-gray-500 mt-1">
                Old keys are retained for validation during transition
              </p>
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
