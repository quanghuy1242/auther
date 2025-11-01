"use client";

import * as React from "react";
import { Badge } from "@/components/ui";
import { formatDateShort } from "@/lib/utils/date-formatter";

export interface ApiKey {
  keyId: string;
  owner: string;
  created: Date;
  expires: Date | null;
  permissions: string;
  status: "active" | "revoked";
}

export interface ApiKeyTableProps {
  apiKeys: ApiKey[];
  onRevoke: (keyId: string) => void;
}

/**
 * API Key Table component for displaying issued API keys
 * Shows key metadata, status badges, and revoke actions
 * 
 * @example
 * <ApiKeyTable
 *   apiKeys={clientApiKeys}
 *   onRevoke={handleRevokeKey}
 * />
 */
export function ApiKeyTable({ apiKeys, onRevoke }: ApiKeyTableProps) {
  if (apiKeys.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 p-8 text-center">
        <p className="text-gray-400 text-sm">
          No API keys have been issued for this client yet.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#111921]/60">
          <tr>
            <th className="p-3 font-medium text-[#93adc8]">Key ID</th>
            <th className="p-3 font-medium text-[#93adc8]">Owner</th>
            <th className="p-3 font-medium text-[#93adc8]">Created</th>
            <th className="p-3 font-medium text-[#93adc8]">Expires</th>
            <th className="p-3 font-medium text-[#93adc8]">Permissions</th>
            <th className="p-3 font-medium text-[#93adc8]">Status</th>
            <th className="p-3 font-medium text-[#93adc8]">Actions</th>
          </tr>
        </thead>
        <tbody className="text-white divide-y divide-slate-800">
          {apiKeys.map((key) => (
            <tr key={key.keyId} className="hover:bg-[#243647]/50 transition-colors">
              <td className="p-3 font-mono text-[#93adc8]">{key.keyId}</td>
              <td className="p-3 text-[#93adc8]">{key.owner}</td>
              <td className="p-3 text-[#93adc8]">{formatDateShort(key.created)}</td>
              <td className="p-3 text-[#93adc8]">
                {key.expires ? formatDateShort(key.expires) : "Never"}
              </td>
              <td className="p-3 font-mono text-[#93adc8] max-w-xs truncate">
                {key.permissions}
              </td>
              <td className="p-3">
                {key.status === "active" ? (
                  <Badge variant="success" dot>
                    Active
                  </Badge>
                ) : (
                  <Badge variant="default" dot>
                    Revoked
                  </Badge>
                )}
              </td>
              <td className="p-3">
                {key.status === "active" ? (
                  <button
                    type="button"
                    onClick={() => onRevoke(key.keyId)}
                    className="text-red-400 hover:text-red-500 text-sm font-medium transition-colors"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="text-slate-500">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
