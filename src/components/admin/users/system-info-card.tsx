import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent, Label, CopyableInput, Badge } from "@/components/ui";
import { formatDateShort } from "@/lib/utils/date-formatter";

interface SystemInfoCardProps {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
}

export function SystemInfoCard({ id, createdAt, updatedAt, emailVerified }: SystemInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-400 mb-1 block">User ID</Label>
            <CopyableInput value={id} readOnly />
          </div>
          <div>
            <Label className="text-gray-400">Date Joined</Label>
            <p className="text-base text-white mt-1">
              {formatDateShort(createdAt)}
            </p>
          </div>
          <div>
            <Label className="text-gray-400">Last Updated</Label>
            <p className="text-base text-white mt-1">
              {formatDateShort(updatedAt)}
            </p>
          </div>
          <div>
            <Label className="text-gray-400">Email Status</Label>
            <div className="mt-1">
              <Badge variant={emailVerified ? "success" : "warning"}>
                {emailVerified ? "Verified" : "Unverified"}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
