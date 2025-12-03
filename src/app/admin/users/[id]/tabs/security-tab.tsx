"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Modal, Icon, Input, Label } from "@/components/ui";
import { setUserPassword, sendPasswordResetEmail, type UserDetail } from "../actions";
import { toast } from "@/lib/toast";

interface UserSecurityTabProps {
  user: UserDetail;
}

export function UserSecurityTab({ user }: UserSecurityTabProps) {
  const [showSetPasswordModal, setShowSetPasswordModal] = React.useState(false);
  const [showSendResetEmailModal, setShowSendResetEmailModal] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");

  const handleSetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password too short", "Password must be at least 8 characters long.");
      return;
    }

    const result = await setUserPassword(user.id, newPassword);
    
    if (result.success) {
      toast.success("Password set", "User password has been updated successfully.");
      setNewPassword("");
      setShowSetPasswordModal(false);
    } else {
      toast.error("Failed to set password", result.error);
    }
  };

  const handleSendResetEmail = async () => {
    const result = await sendPasswordResetEmail(user.id);
    
    if (result.success) {
      toast.success("Reset email sent", "Password reset email has been sent to the user.");
      setShowSendResetEmailModal(false);
    } else {
      toast.error("Failed to send email", result.error);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Password Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white mb-2">
                  Force Password Reset
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  Set a new password for this user directly as an administrator.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowSetPasswordModal(true)}
                >
                  <Icon name="lock" className="mr-2" />
                  Set New Password
                </Button>
              </div>
              <div className="border-t border-slate-700 pt-4">
                <h3 className="text-base font-semibold text-white mb-2">
                  Send Password Reset Email
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  Send a password reset link to the user&apos;s email address.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowSendResetEmailModal(true)}
                >
                  <Icon name="mail" className="mr-2" />
                  Send Reset Link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Set Password Modal */}
      <Modal
          isOpen={showSetPasswordModal}
          onClose={() => {
            setShowSetPasswordModal(false);
            setNewPassword("");
          }}
          title="Set New Password"
        >
          <div className="space-y-4">
            <p className="text-gray-300">
              Set a new password for <strong>{user.name}</strong>.
            </p>
            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 8 characters)"
                className="mt-1"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowSetPasswordModal(false);
                  setNewPassword("");
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSetPassword}>
                Set Password
              </Button>
            </div>
          </div>
        </Modal>

      <Modal
          isOpen={showSendResetEmailModal}
          onClose={() => setShowSendResetEmailModal(false)}
          title="Send Password Reset Email"
        >
          <div className="space-y-4">
            <p className="text-gray-300">
              Send a password reset link to <strong>{user.email}</strong>?
            </p>
            <p className="text-sm text-gray-400">
              The user will receive an email with a link to reset their password.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowSendResetEmailModal(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSendResetEmail}>
                Send Reset Link
              </Button>
            </div>
          </div>
        </Modal>
    </>
  );
}
