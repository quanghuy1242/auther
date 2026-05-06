"use client";

import * as React from "react";

import { Alert, Card, CardContent } from "@/components/ui";
import { DataModelEditor } from "@/components/admin/access-control/data-model-editor";
import { toast } from "@/lib/toast";
import { updateSpaceAuthorizationModels } from "./actions";

interface SpaceModelEditorProps {
  spaceId: string;
  initialModelJson: string;
}

export function SpaceModelEditor({
  spaceId,
  initialModelJson,
}: SpaceModelEditorProps) {
  const [modelJson, setModelJson] = React.useState(initialModelJson);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setModelJson(initialModelJson);
  }, [initialModelJson]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateSpaceAuthorizationModels({
        spaceId,
        modelJson,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to save authorization models");
        toast.error("Failed to save authorization models", result.error);
        return;
      }

      toast.success("Authorization models saved");
    });
  }

  return (
    <Card>
      <CardContent className="p-6">
        {error && (
          <div className="mb-4">
            <Alert variant="error" title="Model Save Failed">
              {error}
            </Alert>
          </div>
        )}
        <DataModelEditor
          model={modelJson}
          onChange={setModelJson}
          onSave={handleSave}
          disabled={isPending}
        />
      </CardContent>
    </Card>
  );
}
