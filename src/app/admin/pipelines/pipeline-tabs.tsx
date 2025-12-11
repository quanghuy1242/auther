"use client";

import { NavTabs, NavTab } from "@/components/ui/nav-tabs";

/**
 * Navigation tabs for the Pipelines section.
 * Uses route-based navigation for lazy loading.
 */
export function PipelineTabs() {
    const tabs: NavTab[] = [
        {
            label: "Editor",
            href: "/admin/pipelines/editor",
            icon: "account_tree",
        },
        {
            label: "Secrets",
            href: "/admin/pipelines/secrets",
            icon: "key",
        },
        {
            label: "Traces",
            href: "/admin/pipelines/traces",
            icon: "timeline",
        },
    ];

    return <NavTabs tabs={tabs} />;
}
