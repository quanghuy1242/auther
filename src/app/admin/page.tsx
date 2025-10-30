import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/layout/alert";
import { Card, CardContent, Badge, Icon } from "@/components/ui";
import Link from "next/link";

export default function AdminDashboard() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Alert Banner */}
      <Alert variant="warning" title="System Maintenance" className="mb-6">
        Scheduled maintenance window: Tonight at 2:00 AM UTC (Est. 30 minutes)
      </Alert>

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
                <p className="text-2xl font-bold text-white">1,234</p>
                <p className="text-sm text-gray-400">Total Users</p>
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
                <p className="text-2xl font-bold text-white">56</p>
                <p className="text-sm text-gray-400">OAuth Clients</p>
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
                <p className="text-2xl font-bold text-white">892</p>
                <p className="text-sm text-gray-400">Active Sessions</p>
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
                <p className="text-2xl font-bold text-white">4</p>
                <p className="text-sm text-gray-400">JWKS Keys</p>
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
          <div className="space-y-3">
            {[
              { user: "john.doe@example.com", ip: "192.168.1.1", time: "2 minutes ago", status: "success" },
              { user: "jane.smith@example.com", ip: "10.0.0.45", time: "15 minutes ago", status: "success" },
              { user: "bob.wilson@example.com", ip: "172.16.0.10", time: "1 hour ago", status: "failed" },
            ].map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1773cf] flex items-center justify-center">
                    <Icon name="person" size="sm" className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{activity.user}</p>
                    <p className="text-xs text-gray-400">{activity.ip}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{activity.time}</span>
                  <Badge variant={activity.status === "success" ? "success" : "danger"}>
                    {activity.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
