"use client";

import * as React from "react";
import { Card, CardContent, Button, Modal, Icon } from "@/components/ui";
import { unlinkAccount, type UserDetail } from "../actions";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils/date-formatter";
import { getProviderConfig } from "../../shared";

interface UserAccountsTabProps {
  user: UserDetail;
}

export function UserAccountsTab({ user }: UserAccountsTabProps) {
  const [accountToUnlink, setAccountToUnlink] = React.useState<string | null>(null);

  const handleUnlinkAccount = async (accountId: string) => {
    const result = await unlinkAccount(accountId, user.id);
    setAccountToUnlink(null);
    if (result?.success) {
      toast.success("Account unlinked", "The OAuth account has been unlinked from this user.");
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">OAuth Providers</h2>
            <p className="text-sm text-gray-400 mt-1">
              Manage linked authentication providers
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {user.accounts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No linked accounts found</p>
            </div>
          ) : (
            user.accounts.map((account) => (
              <Card key={account.id}>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Icon name="key" className="text-primary text-2xl" />
                      <div>
                        <h3 className="text-base font-semibold text-white">
                          {getProviderConfig(account.providerId).name}
                        </h3>
                        <p className="text-sm text-gray-400">
                          Account ID: {account.accountId}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Linked: {formatDate(account.createdAt)}
                        </p>
                      </div>
                    </div>
                    {user.accounts.length > 1 && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setAccountToUnlink(account.id)}
                      >
                        Unlink
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Unlink Account Modal */}
      {accountToUnlink && (
        <Modal
          isOpen={!!accountToUnlink}
          onClose={() => setAccountToUnlink(null)}
          title="Unlink Account"
        >
          <p className="text-gray-300 mb-6">
            Are you sure you want to unlink this account? The user will no longer be able to
            sign in using this provider.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setAccountToUnlink(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => handleUnlinkAccount(accountToUnlink)}>
              Unlink Account
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
