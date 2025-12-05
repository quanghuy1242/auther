import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import { PageHeading, PageContainer } from "@/components/layout";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, Badge, Icon } from "@/components/ui";
import { StatCard } from "@/components/admin";
import { getDashboardStats, getRecentSignIns } from "./actions";
import { formatTimeAgo } from "@/lib/utils/date-formatter";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Admin dashboard overview with system statistics and recent activity",
};

export default async function AdminDashboard() {
  const stats = await getDashboardStats();
  const recentSignIns = await getRecentSignIns(3);

  return (
    <PageContainer>
      {/* Alert Banner */}
      {stats.jwks.daysOld >= 25 && (
        <Alert variant="warning" title="JWKS Key Rotation Recommended" className="mb-6">
          Your signing key is {stats.jwks.latestKeyAge} old. Consider rotating keys to maintain security best practices.
        </Alert>
      )}

      {/* Page Header */}
      <PageHeading
        title="Good morning, Admin"
        description="Welcome back to your Better Auth admin panel"
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon="group"
          iconClassName="text-primary"
          iconBgClassName="bg-primary/20"
          value={stats.users.total.toLocaleString()}
          label="Total Users"
          description={`${stats.users.verified} verified, ${stats.users.unverified} unverified`}
        />

        <StatCard
          icon="apps"
          iconClassName="text-green-500"
          iconBgClassName="bg-green-500/20"
          value={stats.clients.total}
          label="OAuth Clients"
          description={`${stats.clients.trusted} trusted, ${stats.clients.dynamic} dynamic`}
        />

        <StatCard
          icon="schedule"
          iconClassName="text-yellow-500"
          iconBgClassName="bg-yellow-500/20"
          value={stats.activeSessions.toLocaleString()}
          label="Active Sessions"
          description="All good"
        />

        <StatCard
          icon="key"
          iconClassName="text-purple-500"
          iconBgClassName="bg-purple-500/20"
          value={stats.jwks.total}
          label="JWKS Keys"
          description={
            <span className="flex items-center gap-1">
              Latest: {stats.jwks.latestKeyAge}
              {stats.jwks.isHealthy ? (
                <Badge variant="success" className="text-xs">Healthy</Badge>
              ) : (
                <Badge variant="warning" className="text-xs">Rotate Soon</Badge>
              )}
            </span>
          }
        />
      </div>

      {/* Quick Links */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/users/create">
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Icon name="person_add" size="lg" className="text-primary" />
                  <div>
                    <p className="font-semibold text-white">Create User</p>
                    <p className="text-sm text-gray-400">Add a new user account</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/clients/register">
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Icon name="add_box" size="lg" className="text-primary" />
                  <div>
                    <p className="font-semibold text-white">Register Client</p>
                    <p className="text-sm text-gray-400">Add new OAuth client</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/keys">
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Icon name="sync" size="lg" className="text-primary" />
                  <div>
                    <p className="font-semibold text-white">Rotate JWKS</p>
                    <p className="text-sm text-gray-400">Manage signing keys</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Sign-ins</h2>
            <Link href="/admin/sessions" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {recentSignIns.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Icon name="info" className="text-4xl mb-2" />
              <p>No recent sign-in activity</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSignIns.map((activity) => (
                <div key={activity.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 sm:py-2 border-b border-white/10 last:border-0 gap-3 sm:gap-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Icon name="person" size="sm" className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{activity.userEmail}</p>
                      <p className="text-xs text-gray-400">{activity.ipAddress || "Unknown IP"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-shrink-0">
                    <span className="text-xs text-gray-400">{formatTimeAgo(activity.createdAt)}</span>
                    <Badge variant="success">Success</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
