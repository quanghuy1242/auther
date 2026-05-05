"use client";

import Link from "next/link";

import { Badge, Icon, ResponsiveTable } from "@/components/ui";
import { formatDateShort } from "@/lib/utils/date-formatter";
import type { ResourceServerEntity } from "@/lib/repositories";

type ResourceServersClientProps = {
  resourceServers: ResourceServerEntity[];
};

export function ResourceServersClient({ resourceServers }: ResourceServersClientProps) {
  return (
    <div className="overflow-hidden rounded-lg border-0 sm:border sm:border-border-dark">
      <ResponsiveTable
        columns={[
          {
            key: "name",
            header: "Resource Server",
            render: (server) => (
              <div>
                <Link
                  href={`/admin/resource-servers/${server.id}`}
                  className="font-medium text-blue-400 hover:underline"
                >
                  {server.name}
                </Link>
                <p className="text-xs text-gray-400 font-mono">{server.slug}</p>
              </div>
            ),
          },
          {
            key: "audience",
            header: "Audience",
            render: (server) => (
              <code className="rounded bg-black/20 px-2 py-1 text-xs text-gray-300">
                {server.audience}
              </code>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (server) => (
              <Badge variant={server.enabled ? "success" : "warning"} dot>
                {server.enabled ? "Enabled" : "Disabled"}
              </Badge>
            ),
          },
          {
            key: "createdAt",
            header: "Created",
            render: (server) => (
              <span className="text-sm text-gray-400">{formatDateShort(server.createdAt)}</span>
            ),
          },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (server) => (
              <Link
                href={`/admin/resource-servers/${server.id}`}
                className="inline-flex text-[#1773cf] hover:text-[#1773cf]/80"
                aria-label={`View ${server.name}`}
              >
                <Icon name="more_horiz" />
              </Link>
            ),
          },
        ]}
        data={resourceServers}
        keyExtractor={(server) => server.id}
        mobileCardRender={(server) => (
          <Link href={`/admin/resource-servers/${server.id}`}>
            <div className="rounded-lg border border-border-dark bg-card p-4 space-y-3 hover:border-[#1773cf] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{server.name}</p>
                  <p className="mt-1 text-xs text-gray-400 font-mono truncate">{server.slug}</p>
                </div>
                <Badge variant={server.enabled ? "success" : "warning"} dot>
                  {server.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-500">Audience</p>
                <p className="mt-1 truncate text-sm font-mono text-gray-300">{server.audience}</p>
              </div>
              <div className="flex items-center justify-between border-t border-border-dark pt-3">
                <span className="text-xs text-gray-500">Created {formatDateShort(server.createdAt)}</span>
                <Icon name="chevron_right" className="text-[#1773cf]" />
              </div>
            </div>
          </Link>
        )}
        emptyMessage="No resource servers configured"
      />
    </div>
  );
}
