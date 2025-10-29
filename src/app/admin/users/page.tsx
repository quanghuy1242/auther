import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button, Input, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "@/components/ui";
import Link from "next/link";

export default function UsersPage() {
  return (
    <>
      <PageHeading
        title="User Management"
        description="Manage system users, roles, and permissions"
        action={
          <Link href="/admin/users/create">
            <Button variant="primary" leftIcon="add">
              Create User
            </Button>
          </Link>
        }
      >
        <div className="flex gap-3">
          <Input
            placeholder="Search users..."
            leftIcon="search"
            className="max-w-md"
          />
          <Button variant="secondary" leftIcon="filter_list">
            Filters
          </Button>
        </div>
      </PageHeading>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            { id: 1, name: "John Doe", email: "john.doe@example.com", role: "Admin", status: "active", lastLogin: "2 hours ago" },
            { id: 2, name: "Jane Smith", email: "jane.smith@example.com", role: "Editor", status: "active", lastLogin: "1 day ago" },
            { id: 3, name: "Bob Wilson", email: "bob.wilson@example.com", role: "Viewer", status: "inactive", lastLogin: "1 week ago" },
          ].map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div>
                  <p className="font-medium text-white">{user.name}</p>
                  <p className="text-sm text-gray-400">{user.email}</p>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-gray-200">{user.role}</span>
              </TableCell>
              <TableCell>
                <Badge variant={user.status === "active" ? "success" : "default"} dot>
                  {user.status === "active" ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-gray-400 text-sm">{user.lastLogin}</span>
              </TableCell>
              <TableCell>
                <Link href={`/admin/users/${user.id}`} className="text-[#1773cf] hover:underline text-sm">
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
