import * as React from "react";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui";
import { getUsers } from "./actions";
import { UsersClient } from "./users-client";

interface UsersPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    verified?: string;
  }>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const search = params.search || "";
  const verified = params.verified === "true" ? true : params.verified === "false" ? false : null;

  const usersData = await getUsers({
    page,
    pageSize: 10,
    search,
    verified,
  });

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeading
        title="User Management"
        description="Manage, search, and filter all users in the system."
        action={
          <Link href="/admin/users/create">
            <Button variant="primary" leftIcon="person_add">
              Add User
            </Button>
          </Link>
        }
      />

      <UsersClient initialData={usersData} />
    </div>
  );
}
