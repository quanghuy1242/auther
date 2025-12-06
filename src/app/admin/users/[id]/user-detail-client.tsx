"use client";

import * as React from "react";
import Image from "next/image";
import { Button, Badge, Modal, Tabs, Card, CardContent } from "@/components/ui";
import { toggleEmailVerification, forceLogoutUser, type UserDetail } from "./actions";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

import { UserProfileTab } from "./tabs/profile-tab";
import { UserAccountsTab } from "./tabs/accounts-tab";
import { UserSessionsTab } from "./tabs/sessions-tab";
import { UserSecurityTab } from "./tabs/security-tab";
import { UserGroupsTab } from "./tabs/groups-tab";

interface UserDetailClientProps {
  user: UserDetail;
}

export function UserDetailClient({ user }: UserDetailClientProps) {
  const router = useRouter();
  const [showForceLogoutModal, setShowForceLogoutModal] = React.useState(false);

  // Helper to get user initials
  const getUserInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleToggleEmailVerification = async () => {
    const result = await toggleEmailVerification(user.id, !user.emailVerified);
    if (result?.success) {
      const message = user.emailVerified
        ? "Email verification status removed"
        : "Email marked as verified";
      toast.success("Status updated", message);
      router.refresh();
    }
  };

  const handleForceLogout = async () => {
    const result = await forceLogoutUser(user.id);
    setShowForceLogoutModal(false);
    if (result?.success) {
      toast.success("User logged out", "All user sessions have been terminated.");
      router.refresh();
    }
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
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
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
            onClick={handleToggleEmailVerification}
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
            content: <UserProfileTab user={user} />,
          },
          {
            label: "Groups",
            content: <UserGroupsTab userId={user.id} />,
          },
          {
            label: "Linked Accounts",
            content: <UserAccountsTab user={user} />,
          },
          {
            label: "Sessions",
            content: <UserSessionsTab user={user} />,
          },
          {
            label: "Security",
            content: <UserSecurityTab user={user} />,
          },
          {
            label: "Activity",
            content: (
              <div>
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
    </>
  );
}