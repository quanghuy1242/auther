"use client";

import Link from "next/link";

import { Badge, Icon, ResponsiveTable } from "@/components/ui";
import { formatDateShort } from "@/lib/utils/date-formatter";
import type { AuthorizationSpaceEntity } from "@/lib/repositories";

export type AuthorizationSpaceListItem = AuthorizationSpaceEntity & {
  resourceServerName: string | null;
  resourceServerAudience: string | null;
  modelCount: number;
};

type AuthorizationSpacesClientProps = {
  spaces: AuthorizationSpaceListItem[];
};

export function AuthorizationSpacesClient({ spaces }: AuthorizationSpacesClientProps) {
  return (
    <div className="overflow-hidden rounded-lg border-0 sm:border sm:border-border-dark">
      <ResponsiveTable
        columns={[
          {
            key: "name",
            header: "Authorization Space",
            render: (space) => (
              <div>
                <Link
                  href={`/admin/authorization-spaces/${space.id}`}
                  className="font-medium text-blue-400 hover:underline"
                >
                  {space.name}
                </Link>
                <p className="text-xs text-gray-400 font-mono">{space.slug}</p>
              </div>
            ),
          },
          {
            key: "resourceServer",
            header: "Resource Server",
            render: (space) => (
              <div>
                <p className="text-sm text-gray-300">{space.resourceServerName ?? "None"}</p>
                {space.resourceServerAudience && (
                  <p className="text-xs text-gray-500 font-mono">{space.resourceServerAudience}</p>
                )}
              </div>
            ),
          },
          {
            key: "models",
            header: "Models",
            render: (space) => (
              <span className="text-sm text-gray-400">
                {space.modelCount === 1 ? "1 model" : `${space.modelCount} models`}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (space) => (
              <Badge variant={space.enabled ? "success" : "warning"} dot>
                {space.enabled ? "Enabled" : "Disabled"}
              </Badge>
            ),
          },
          {
            key: "createdAt",
            header: "Created",
            render: (space) => (
              <span className="text-sm text-gray-400">{formatDateShort(space.createdAt)}</span>
            ),
          },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (space) => (
              <Link
                href={`/admin/authorization-spaces/${space.id}`}
                className="inline-flex text-[#1773cf] hover:text-[#1773cf]/80"
                aria-label={`View ${space.name}`}
              >
                <Icon name="more_horiz" />
              </Link>
            ),
          },
        ]}
        data={spaces}
        keyExtractor={(space) => space.id}
        mobileCardRender={(space) => (
          <Link href={`/admin/authorization-spaces/${space.id}`}>
            <div className="rounded-lg border border-border-dark bg-card p-4 space-y-3 hover:border-[#1773cf] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{space.name}</p>
                  <p className="mt-1 text-xs text-gray-400 font-mono truncate">{space.slug}</p>
                </div>
                <Badge variant={space.enabled ? "success" : "warning"} dot>
                  {space.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-gray-500">Resource Server</p>
                  <p className="mt-1 text-gray-300 truncate">{space.resourceServerName ?? "None"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Models</p>
                  <p className="mt-1 text-gray-300">
                    {space.modelCount === 1 ? "1 model" : `${space.modelCount} models`}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border-dark pt-3">
                <span className="text-xs text-gray-500">Created {formatDateShort(space.createdAt)}</span>
                <Icon name="chevron_right" className="text-[#1773cf]" />
              </div>
            </div>
          </Link>
        )}
        emptyMessage="No authorization spaces configured"
      />
    </div>
  );
}
