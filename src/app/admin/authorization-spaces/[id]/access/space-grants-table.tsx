"use client";

import { Button } from "@/components/ui";
import { Badge } from "@/components/ui";
import { ResponsiveTable } from "@/components/ui";
import type { Tuple } from "@/lib/repositories";
import { revokeSpacePermission } from "./actions";

type SubjectOption = {
  id: string;
  label: string;
};

interface SpaceGrantsTableProps {
  tuples: Tuple[];
  modelsByEntityType: Record<string, { entityType: string }>;
  usersById: Record<string, SubjectOption>;
  groupsById: Record<string, SubjectOption>;
  spaceId: string;
}

function subjectLabel(
  tuple: Tuple,
  usersById: Record<string, SubjectOption>,
  groupsById: Record<string, SubjectOption>,
): string {
  if (tuple.subjectType === "user") {
    return usersById[tuple.subjectId]?.label ?? tuple.subjectId;
  }

  if (tuple.subjectType === "group") {
    return groupsById[tuple.subjectId]?.label ?? tuple.subjectId;
  }

  return tuple.subjectId;
}

export function SpaceGrantsTable({
  tuples,
  modelsByEntityType,
  usersById,
  groupsById,
  spaceId,
}: SpaceGrantsTableProps) {
  return (
    <ResponsiveTable
      data={tuples}
      keyExtractor={(tuple) => tuple.id}
      columns={[
        {
          key: "resource",
          header: "Resource",
          render: (tuple) => (
            <div>
              <p className="font-mono text-sm text-gray-200">
                {modelsByEntityType[tuple.entityType]?.entityType ?? tuple.entityType}
              </p>
              <p className="text-xs text-gray-500">{tuple.entityId}</p>
            </div>
          ),
        },
        {
          key: "relation",
          header: "Relation",
          render: (tuple) => <Badge variant="default">{tuple.relation}</Badge>,
        },
        {
          key: "subject",
          header: "Subject",
          render: (tuple) => (
            <div>
              <p className="text-sm text-gray-200">{subjectLabel(tuple, usersById, groupsById)}</p>
              <p className="text-xs text-gray-500">{tuple.subjectType}</p>
            </div>
          ),
        },
        {
          key: "action",
          header: "",
          className: "text-right",
          render: (tuple) => (
            <form action={revokeSpacePermission}>
              <input type="hidden" name="spaceId" value={spaceId} />
              <input type="hidden" name="tupleId" value={tuple.id} />
              <Button type="submit" variant="ghost" size="sm">
                Revoke
              </Button>
            </form>
          ),
        },
      ]}
      emptyMessage="No grants have been created in this space."
    />
  );
}
