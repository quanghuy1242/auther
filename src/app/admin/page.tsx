import type { Metadata } from "next";
import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, Badge, Icon } from "@/components/ui";
import Link from "next/link";
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
    <div className="max-w-6xl mx-auto">
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
        <Card>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#1773cf]/20 flex items-center justify-center">
                <Icon name="group" size="lg" className="text-[#1773cf]" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-white">{stats.users.total.toLocaleString()}</p>
                <p className="text-sm text-gray-400">Total Users</p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.users.verified} verified, {stats.users.unverified} unverified
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Icon name="apps" size="lg" className="text-green-500" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-white">{stats.clients.total}</p>
                <p className="text-sm text-gray-400">OAuth Clients</p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.clients.trusted} trusted, {stats.clients.dynamic} dynamic
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <Icon name="schedule" size="lg" className="text-yellow-500" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-white">{stats.activeSessions.toLocaleString()}</p>
                <p className="text-sm text-gray-400">Active Sessions</p>
                <p className="text-xs text-gray-500 mt-1">All good</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Icon name="key" size="lg" className="text-purple-500" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-white">{stats.jwks.total}</p>
                <p className="text-sm text-gray-400">JWKS Keys</p>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  Latest: {stats.jwks.latestKeyAge}
                  {stats.jwks.isHealthy ? (
                    <Badge variant="success" className="text-xs">Healthy</Badge>
                  ) : (
                    <Badge variant="warning" className="text-xs">Rotate Soon</Badge>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/users/create">
            <Card className="hover:border-[#1773cf] transition-colors cursor-pointer">
              <CardContent>
                <div className="flex items-center gap-3">
                  <Icon name="person_add" size="lg" className="text-[#1773cf]" />
                  <div>
                    <p className="font-semibold text-white">Create User</p>
                    <p className="text-sm text-gray-400">Add a new user account</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/clients/register">
            <Card className="hover:border-[#1773cf] transition-colors cursor-pointer">
              <CardContent>
                <div className="flex items-center gap-3">
                  <Icon name="add_box" size="lg" className="text-[#1773cf]" />
                  <div>
                    <p className="font-semibold text-white">Register Client</p>
                    <p className="text-sm text-gray-400">Add new OAuth client</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/keys">
            <Card className="hover:border-[#1773cf] transition-colors cursor-pointer">
              <CardContent>
                <div className="flex items-center gap-3">
                  <Icon name="sync" size="lg" className="text-[#1773cf]" />
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
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Sign-ins</h2>
            <Link href="/admin/sessions" className="text-sm text-[#1773cf] hover:underline">
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
                    <div className="w-8 h-8 rounded-full bg-[#1773cf] flex items-center justify-center flex-shrink-0">
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
    </div>
  );
}
