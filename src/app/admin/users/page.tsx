import * as React from "react";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui";
import { getUsers } from "./actions";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const usersData = await getUsers({ page: 1, pageSize: 10 });

  return (
    <>
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
    </>
  );
}
