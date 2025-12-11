import type { BreadcrumbItem } from "@/lib/types";

const routeLabels: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/users": "Users",
  "/admin/users/create": "Create User",
  "/admin/groups": "Groups",
  "/admin/clients": "OAuth Clients",
  "/admin/clients/register": "Register Client",
  "/admin/sessions": "Sessions",
  "/admin/keys": "JWKS Keys",
  "/admin/settings": "Configuration & Secrets",
  "/admin/profile": "Profile Settings",
  "/admin/webhooks": "Webhooks",
  "/admin/webhooks/create": "Create Webhook",
  "/admin/pipelines": "Pipelines",
  "/components-demo": "Component Showcase",
};

/**
 * Generate breadcrumb items from pathname
 * Handles both static and dynamic routes
 */
export function generateBreadcrumbs(pathname: string, dynamicLabels?: Record<string, string>): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];

  // Always start with Admin for admin routes
  if (pathname.startsWith("/admin")) {
    items.push({ label: "Admin", href: "/admin" });

    // If not just /admin, process the path
    if (pathname !== "/admin") {
      const segments = pathname.split("/").filter(Boolean);
      let currentPath = "/admin";

      // Skip the first segment (admin) as we already added it
      for (let i = 1; i < segments.length; i++) {
        currentPath += `/${segments[i]}`;
        const fullPath = currentPath;
        const relativePath = fullPath.replace(/^\/admin/, "") || fullPath;
        const isLast = i === segments.length - 1;

        // Check if this is a dynamic segment (UUID pattern or "edit")
        const isDynamic = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segments[i]);

        if (isDynamic) {
          const relativeKey = relativePath.startsWith("/")
            ? relativePath
            : `/${relativePath}`;
          const dynamicLabel =
            dynamicLabels?.[fullPath] ??
            dynamicLabels?.[relativeKey] ??
            dynamicLabels?.[relativeKey.slice(1)];

          if (dynamicLabel) {
            // Use provided dynamic label (e.g., client name, user email)
            items.push({
              label: dynamicLabel,
              href: isLast ? undefined : fullPath,
            });
          }

          continue;
        }

        // Static route segment
        const label = routeLabels[fullPath] || capitalize(segments[i]);
        items.push({
          label,
          href: isLast ? undefined : fullPath,
        });
      }
    }
  } else {
    // For non-admin routes, just show the current page
    const label = routeLabels[pathname] || "Home";
    items.push({ label });
  }

  return items;
}

/**
 * Capitalize first letter of a string and replace hyphens/underscores with spaces
 */
function capitalize(str: string): string {
  return str
    .replace(/[-_]/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
