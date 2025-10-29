import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button, Input, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "@/components/ui";
import Link from "next/link";

export default function ClientsPage() {
  return (
    <>
      <PageHeading
        title="OAuth Client Management"
        description="Manage OAuth 2.0 clients and applications"
        action={
          <Link href="/admin/clients/register">
            <Button variant="primary" leftIcon="add">
              Register New Client
            </Button>
          </Link>
        }
      >
        <div className="flex gap-3">
          <Input
            placeholder="Search clients..."
            leftIcon="search"
            className="max-w-md"
          />
        </div>
      </PageHeading>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Redirect URIs</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            { id: "client-1", name: "Web Application", type: "trusted", uris: 2, lastUsed: "5 minutes ago" },
            { id: "client-2", name: "Mobile App", type: "trusted", uris: 1, lastUsed: "1 hour ago" },
            { id: "client-3", name: "Third Party API", type: "dynamic", uris: 3, lastUsed: "2 days ago" },
          ].map((client) => (
            <TableRow key={client.id}>
              <TableCell>
                <p className="font-medium text-white">{client.name}</p>
                <p className="text-xs text-gray-400 font-mono">{client.id}</p>
              </TableCell>
              <TableCell>
                <Badge variant={client.type === "trusted" ? "success" : "default"}>
                  {client.type === "trusted" ? "Trusted" : "Dynamic"}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-gray-200">{client.uris} URI(s)</span>
              </TableCell>
              <TableCell>
                <span className="text-gray-400 text-sm">{client.lastUsed}</span>
              </TableCell>
              <TableCell>
                <Link href={`/admin/clients/${client.id}`} className="text-[#1773cf] hover:underline text-sm">
                  Configure
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
