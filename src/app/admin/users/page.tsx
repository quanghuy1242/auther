import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import { PageHeading, PageContainer } from "@/components/layout";
import { Button } from "@/components/ui";
import { getUsers } from "./actions";
import { UsersClient } from "./users-client";

export const metadata: Metadata = {
  title: "User Management",
  description: "Manage, search, and filter all users in the system",
};

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
    <PageContainer>
      <PageHeading
        title="User Management"
        description="Manage, search, and filter all users in the system."
        action={
          <Link href="/admin/users/create">
            <Button variant="primary" size="sm" leftIcon="person_add">
              Add User
            </Button>
          </Link>
        }
      />

      <UsersClient initialData={usersData} />
    </PageContainer>
  );
}
