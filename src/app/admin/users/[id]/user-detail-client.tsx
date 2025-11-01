"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Label, Tabs, Modal, CopyableInput } from "@/components/ui";
import { Icon } from "@/components/ui/icon";
import { formatDate, formatDateShort } from "@/lib/utils/date-formatter";
import { 
  updateUserProfile, 
  toggleEmailVerification, 
  unlinkAccount, 
  revokeUserSession, 
  forceLogoutUser,
  setUserPassword,
  sendPasswordResetEmail,
  type UserDetail,
  type UpdateUserState 
} from "./actions";


interface UserDetailClientProps {
  user: UserDetail;
}

export function UserDetailClient({ user }: UserDetailClientProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [accountToUnlink, setAccountToUnlink] = React.useState<string | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = React.useState<string | null>(null);
  const [showForceLogoutModal, setShowForceLogoutModal] = React.useState(false);
  const [showSetPasswordModal, setShowSetPasswordModal] = React.useState(false);
  const [showSendResetEmailModal, setShowSendResetEmailModal] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [passwordError, setPasswordError] = React.useState("");
  const [passwordSuccess, setPasswordSuccess] = React.useState(false);
  const [resetEmailSuccess, setResetEmailSuccess] = React.useState(false);

  // Helper to get user initials
  const getUserInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const updateWithUserId = updateUserProfile.bind(null, user.id);
  const [profileState, profileAction] = useFormState<UpdateUserState, FormData>(
    updateWithUserId,
    { success: false }
  );

  React.useEffect(() => {
    if (profileState.success) {
      setIsEditing(false);
    }
  }, [profileState.success]);

  const handleToggleVerification = async () => {
    await toggleEmailVerification(user.id, !user.emailVerified);
  };

  const handleUnlinkAccount = async (accountId: string) => {
    await unlinkAccount(accountId, user.id);
    setAccountToUnlink(null);
  };

  const handleRevokeSession = async (sessionToken: string) => {
    await revokeUserSession(sessionToken, user.id);
    setSessionToRevoke(null);
  };

  const handleForceLogout = async () => {
    await forceLogoutUser(user.id);
    setShowForceLogoutModal(false);
  };

  const handleSetPassword = async () => {
    setPasswordError("");
    setPasswordSuccess(false);

    if (!newPassword || newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long");
      return;
    }

    const result = await setUserPassword(user.id, newPassword);
    
    if (result.success) {
      setPasswordSuccess(true);
      setNewPassword("");
      setTimeout(() => {
        setShowSetPasswordModal(false);
        setPasswordSuccess(false);
      }, 2000);
    } else {
      setPasswordError(result.error || "Failed to set password");
    }
  };

  const handleSendResetEmail = async () => {
    setResetEmailSuccess(false);
    const result = await sendPasswordResetEmail(user.id);
    
    if (result.success) {
      setResetEmailSuccess(true);
      setTimeout(() => {
        setShowSendResetEmailModal(false);
        setResetEmailSuccess(false);
      }, 2000);
    }
  };

  const getProviderName = (providerId: string) => {
    const names: Record<string, string> = {
      google: "Google",
      github: "GitHub",
      credential: "Email/Password",
    };
    return names[providerId] || providerId;
  };

  return (
    <>
      {/* User Header */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div className="flex items-center gap-4">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#1773cf] flex items-center justify-center">
              <span className="text-white text-2xl font-bold">{getUserInitials(user.name)}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-4xl font-black text-white tracking-tight">{user.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant={user.emailVerified ? "success" : "warning"} dot>
                {user.emailVerified ? "Verified" : "Unverified"}
              </Badge>
              <p className="text-base text-gray-400">{user.email}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={user.emailVerified ? "secondary" : "primary"}
            size="sm"
            onClick={handleToggleVerification}
          >
            {user.emailVerified ? "Mark Unverified" : "Mark Verified"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowForceLogoutModal(true)}
          >
            Force Logout All
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          {
            label: "Profile",
            content: (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6">
                <div className="md:col-span-2">
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>User Details</CardTitle>
                        <Button
                          variant={isEditing ? "secondary" : "primary"}
                          size="sm"
                          onClick={() => setIsEditing(!isEditing)}
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {isEditing ? (
                        <form action={profileAction} className="space-y-4">
                          <div>
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                              id="name"
                              name="name"
                              defaultValue={user.name}
                              required
                            />
                            {profileState.errors?.name && (
                              <p className="text-sm text-red-500 mt-1">{profileState.errors.name}</p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="username">Username</Label>
                            <Input
                              id="username"
                              name="username"
                              defaultValue={user.username || ""}
                            />
                            {profileState.errors?.username && (
                              <p className="text-sm text-red-500 mt-1">{profileState.errors.username}</p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="displayUsername">Display Username</Label>
                            <Input
                              id="displayUsername"
                              name="displayUsername"
                              defaultValue={user.displayUsername || ""}
                            />
                            {profileState.errors?.displayUsername && (
                              <p className="text-sm text-red-500 mt-1">{profileState.errors.displayUsername}</p>
                            )}
                          </div>
                          {profileState.error && (
                            <p className="text-sm text-red-500">{profileState.error}</p>
                          )}
                          {profileState.success && (
                            <p className="text-sm text-green-500">Profile updated successfully!</p>
                          )}
                          <Button type="submit" variant="primary" size="sm">
                            Save Changes
                          </Button>
                        </form>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <Label className="text-gray-400">Full Name</Label>
                            <p className="text-base text-white mt-1">{user.name}</p>
                          </div>
                          <div>
                            <Label className="text-gray-400">Email</Label>
                            <p className="text-base text-white mt-1">{user.email}</p>
                          </div>
                          <div>
                            <Label className="text-gray-400">Username</Label>
                            <p className="text-base text-white mt-1">{user.username || "—"}</p>
                          </div>
                          <div>
                            <Label className="text-gray-400">Display Username</Label>
                            <p className="text-base text-white mt-1">{user.displayUsername || "—"}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>System Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <CopyableInput
                          label="User ID"
                          value={user.id}
                          labelClassName="text-gray-400"
                          className="font-mono text-sm bg-[#111921] border-slate-700 text-white pr-10"
                        />
                        <div>
                          <Label className="text-gray-400">Created</Label>
                          <p className="text-base text-white mt-1">
                            {formatDateShort(user.createdAt)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-400">Last Updated</Label>
                          <p className="text-base text-white mt-1">
                            {formatDateShort(user.updatedAt)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-400">Email Status</Label>
                          <div className="mt-1">
                            <Badge variant={user.emailVerified ? "success" : "warning"}>
                              {user.emailVerified ? "Verified" : "Unverified"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            label: "Linked Accounts",
            content: (
              <div className="pt-6 space-y-6">
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
                              <Icon name="key" className="text-[#1773cf] text-2xl" />
                              <div>
                                <h3 className="text-base font-semibold text-white">
                                  {getProviderName(account.providerId)}
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
            ),
          },
          {
            label: "Sessions",
            content: (
              <div className="pt-6 space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-white">Active Sessions</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      Manage user&apos;s active sessions
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {user.sessions.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-400">No active sessions</p>
                    </div>
                  ) : (
                    user.sessions.map((session) => {
                      const isExpired = new Date(session.expiresAt) < new Date();

                      return (
                        <Card key={session.id}>
                          <CardContent>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="text-base font-semibold text-white">
                                    {session.userAgent || "Unknown Device"}
                                  </h3>
                                  {isExpired && <Badge variant="danger">Expired</Badge>}
                                </div>
                                <div className="space-y-1 text-sm text-gray-400">
                                  <p>IP Address: {session.ipAddress || "Unknown"}</p>
                                  <p>Created: {formatDate(session.createdAt)}</p>
                                  <p>Expires: {formatDate(session.expiresAt)}</p>
                                </div>
                              </div>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setSessionToRevoke(session.token)}
                              >
                                Revoke
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            ),
          },
          {
            label: "Security",
            content: (
              <div className="pt-6 space-y-6">
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
            ),
          },
          {
            label: "Activity",
            content: (
              <div className="pt-6">
                <Card>
                  <CardContent>
                    <p className="text-center py-12 text-gray-400">
                      Activity log coming soon...
                    </p>
                  </CardContent>
                </Card>
              </div>
            ),
          },
        ]}
      />

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

      {/* Revoke Session Modal */}
      {sessionToRevoke && (
        <Modal
          isOpen={!!sessionToRevoke}
          onClose={() => setSessionToRevoke(null)}
          title="Revoke Session"
        >
          <p className="text-gray-300 mb-6">
            Are you sure you want to revoke this session? The user will be logged out from
            this device.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setSessionToRevoke(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => handleRevokeSession(sessionToRevoke)}>
              Revoke Session
            </Button>
          </div>
        </Modal>
      )}

      {/* Force Logout Modal */}
      {showForceLogoutModal && (
        <Modal
          isOpen={showForceLogoutModal}
          onClose={() => setShowForceLogoutModal(false)}
          title="Force Logout All Sessions"
        >
          <p className="text-gray-300 mb-6">
            Are you sure you want to log out this user from all devices? This will revoke ALL
            active sessions and the user will need to sign in again.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowForceLogoutModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleForceLogout}>
              Force Logout All
            </Button>
          </div>
        </Modal>
      )}

      {/* Set Password Modal */}
      <Modal
          isOpen={showSetPasswordModal}
          onClose={() => {
            setShowSetPasswordModal(false);
            setNewPassword("");
            setPasswordError("");
            setPasswordSuccess(false);
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
              {passwordError && (
                <p className="text-sm text-red-500 mt-2">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-green-500 mt-2">
                  Password updated successfully!
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowSetPasswordModal(false);
                  setNewPassword("");
                  setPasswordError("");
                  setPasswordSuccess(false);
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
          onClose={() => {
            setShowSendResetEmailModal(false);
            setResetEmailSuccess(false);
          }}
          title="Send Password Reset Email"
        >
          <div className="space-y-4">
            <p className="text-gray-300">
              Send a password reset link to <strong>{user.email}</strong>?
            </p>
            <p className="text-sm text-gray-400">
              The user will receive an email with a link to reset their password.
            </p>
            {resetEmailSuccess && (
              <p className="text-sm text-green-500">
                Password reset email sent successfully!
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowSendResetEmailModal(false);
                  setResetEmailSuccess(false);
                }}
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
