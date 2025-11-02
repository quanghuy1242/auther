import type { Metadata } from "next";
import * as React from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { getSessions } from "../actions";
import { SessionsClient } from "./sessions-client";

export const metadata: Metadata = {
  title: "Sessions",
  description: "Manage active and expired user sessions across all devices",
};

export const dynamic = "force-dynamic";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; activeOnly?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const search = params.search || "";
  const activeOnly = params.activeOnly === "true";

  const { sessions, total, totalPages } = await getSessions({
    page,
    search,
    activeOnly,
  });

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeading
        title="Sessions"
        description="Manage active and expired user sessions across all devices"
      />

      <SessionsClient
        initialSessions={sessions}
        initialTotal={total}
        initialPage={page}
        totalPages={totalPages}
        initialSearch={search}
        initialActiveOnly={activeOnly}
      />
    </div>
  );
}
