import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardHeader, CardTitle, CardContent, Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "@/components/ui";

export default function KeysPage() {
  return (
    <>
      <PageHeading
        title="JWKS Key Management"
        description="Manage JSON Web Key Sets for token signing"
        action={
          <Button variant="primary" leftIcon="sync">
            Rotate JWKS Now
          </Button>
        }
      />

      {/* Current Active Keys */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current Active Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key ID</TableHead>
                <TableHead>Algorithm</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { kid: "key-2024-10-29-abc123", alg: "RS256", created: "2024-10-29 08:00 UTC", status: "ok" },
                { kid: "key-2024-10-22-def456", alg: "RS256", created: "2024-10-22 08:00 UTC", status: "ok" },
                { kid: "key-2024-10-15-ghi789", alg: "RS256", created: "2024-10-15 08:00 UTC", status: "breached" },
              ].map((key) => (
                <TableRow key={key.kid}>
                  <TableCell>
                    <code className="text-xs font-mono text-gray-200">{key.kid}</code>
                  </TableCell>
                  <TableCell>
                    <span className="text-gray-200">{key.alg}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-gray-400 text-sm">{key.created}</span>
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
        </CardContent>
      </Card>

      {/* Rotation History */}
      <Card>
        <CardHeader>
          <CardTitle>Rotation History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { action: "Key rotated", kid: "key-2024-10-29-abc123", time: "2024-10-29 08:00 UTC", type: "sync" },
              { action: "Key rotated", kid: "key-2024-10-22-def456", time: "2024-10-22 08:00 UTC", type: "sync" },
              { action: "Key deleted", kid: "key-2024-10-08-old123", time: "2024-10-15 08:05 UTC", type: "delete" },
            ].map((event, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  event.type === "sync" ? "bg-[#1773cf]/20" : "bg-red-500/20"
                }`}>
                  <span className="material-symbols-outlined text-[18px]">
                    {event.type}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{event.action}</p>
                  <p className="text-xs text-gray-400 font-mono">{event.kid}</p>
                  <p className="text-xs text-gray-500 mt-1">{event.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
