import type { ReactNode } from "react";
import type { Metadata } from "next";
import { PageHeading, PageContainer } from "@/components/layout";
import { PipelineTabs } from "./pipeline-tabs";

export const metadata: Metadata = {
    title: "Pipelines",
    description: "Visual editor for authentication pipeline flows",
};

/**
 * Shared layout for all pipeline pages.
 * Provides common header and navigation tabs.
 * Each tab is a separate route for lazy loading.
 */
export default function PipelinesLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <PageContainer>
            <PageHeading
                title="Pipelines"
                description="Configure authentication flows with visual scripting"
            />

            {/* Route-based tabs for lazy loading */}
            <PipelineTabs />

            {/* Page content (Editor, Secrets, or Traces) */}
            {children}
        </PageContainer>
    );
}
